#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#pragma comment(lib, "bcrypt.lib")

#ifndef OBJ_DONT_REPARSE
#define OBJ_DONT_REPARSE 0x00001000L
#endif
#ifndef FILE_OPEN_REPARSE_POINT
#define FILE_OPEN_REPARSE_POINT 0x00200000
#endif
#ifndef FILE_OPEN_FOR_BACKUP_INTENT
#define FILE_OPEN_FOR_BACKUP_INTENT 0x00004000
#endif
#ifndef FILE_WRITE_THROUGH
#define FILE_WRITE_THROUGH 0x00000002
#endif
#ifndef FILE_RENAME_REPLACE_IF_EXISTS
#define FILE_RENAME_REPLACE_IF_EXISTS 0x00000001
#endif
#ifndef FILE_RENAME_POSIX_SEMANTICS
#define FILE_RENAME_POSIX_SEMANTICS 0x00000002
#endif
#ifndef FILE_LINK_REPLACE_IF_EXISTS
#define FILE_LINK_REPLACE_IF_EXISTS 0x00000001
#endif
#ifndef FILE_LINK_POSIX_SEMANTICS
#define FILE_LINK_POSIX_SEMANTICS 0x00000002
#endif
#ifndef FILE_DISPOSITION_DELETE
#define FILE_DISPOSITION_DELETE 0x00000001
#endif
#ifndef FILE_DISPOSITION_POSIX_SEMANTICS
#define FILE_DISPOSITION_POSIX_SEMANTICS 0x00000002
#endif
#ifndef FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE
#define FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE 0x00000010
#endif
#ifndef FILE_DISPOSITION_ON_CLOSE
#define FILE_DISPOSITION_ON_CLOSE 0x00000008
#endif

namespace {

constexpr std::array<char, 8> kRequestMagic{'M', 'D', 'C', 'W', 'R', 'E', 'Q', '1'};
constexpr std::array<char, 8> kResponseMagic{'M', 'D', 'C', 'W', 'R', 'E', 'S', '1'};
constexpr std::uint32_t kProtocolVersion = 1;
constexpr std::uint32_t kOperationInspectParent = 1;
constexpr std::uint32_t kOperationInspectChild = 2;
constexpr std::uint32_t kOperationWrite = 3;
constexpr std::uint32_t kOperationRecover = 4;
constexpr std::uint32_t kFlagExpectedParent = 1U << 0;
constexpr std::uint32_t kFlagExpectedChild = 1U << 1;
constexpr std::uint32_t kFlagReplace = 1U << 2;
constexpr std::uint32_t kFlagRecoveryRollback = 1U << 3;
constexpr std::uint32_t kFlagRecoveryTemporary = 1U << 4;
constexpr std::uint32_t kFlagRecoveryCapability = 1U << 5;
#if defined(MDCW_TEST_FAULTS)
constexpr std::uint32_t kFlagTestRollback = 1U << 16;
constexpr std::uint32_t kFlagTestPauseAfterTemp = 1U << 17;
constexpr std::uint32_t kFlagTestPauseAfterFlush = 1U << 18;
constexpr std::uint32_t kFlagTestPauseAfterBackup = 1U << 19;
constexpr std::uint32_t kFlagTestPausePromotionTransition = 1U << 20;
constexpr std::uint32_t kFlagTestPauseAfterPromotion = 1U << 21;
constexpr std::uint32_t kFlagTestPauseRollback = 1U << 22;
constexpr std::uint32_t kFlagTestSharingRetries = 1U << 23;
constexpr std::uint32_t kFlagTestInitialDispositionTransient = 1U << 24;
constexpr std::uint32_t kFlagTestInitialDispositionPermanent = 1U << 25;
constexpr std::uint32_t kFlagTestInitialCleanupPermanent = 1U << 26;
constexpr std::uint32_t kFlagTestPauseBackupIntentInterval = 1U << 27;
constexpr std::uint32_t kFlagTestPausePromotionIntentInterval = 1U << 28;
constexpr std::uint32_t kFlagTestPauseAfterCreateBeforeIntent = 1U << 29;
#endif
constexpr std::uint32_t kKnownFlags = kFlagExpectedParent | kFlagExpectedChild | kFlagReplace | kFlagRecoveryRollback | kFlagRecoveryTemporary | kFlagRecoveryCapability
#if defined(MDCW_TEST_FAULTS)
  | kFlagTestRollback | kFlagTestPauseAfterTemp | kFlagTestPauseAfterFlush | kFlagTestPauseAfterBackup
  | kFlagTestPausePromotionTransition | kFlagTestPauseAfterPromotion | kFlagTestPauseRollback
  | kFlagTestSharingRetries | kFlagTestInitialDispositionTransient | kFlagTestInitialDispositionPermanent
  | kFlagTestInitialCleanupPermanent | kFlagTestPauseBackupIntentInterval | kFlagTestPausePromotionIntentInterval
  | kFlagTestPauseAfterCreateBeforeIntent
#endif
  ;
constexpr std::uint32_t kResponseOpened = 1;
constexpr std::uint32_t kResponseResult = 2;
constexpr std::uint32_t kResponseError = 3;
constexpr std::uint32_t kResponseCancelled = 4;
constexpr std::uint32_t kResponseProgress = 5;
constexpr std::uint8_t kActionContinue = 1;
constexpr std::uint8_t kActionCancel = 2;
constexpr std::uint32_t kCancelChunk = 0xffffffffU;
constexpr std::uint32_t kMaxParentBytes = 32U * 1024U;
constexpr std::uint32_t kMaxNameBytes = 1024U;
constexpr std::uint32_t kMaxChunkBytes = 1024U * 1024U;
constexpr std::uint64_t kMaxOutputBytes = 512ULL * 1024ULL * 1024ULL;
constexpr std::uint32_t kMinDeadlineMs = 100;
constexpr std::uint32_t kMaxDeadlineMs = 120000;
constexpr std::uint32_t kRetryAttempts = 8;
constexpr std::size_t kRecoveryCapabilityBytes = 32;
constexpr char kRecoveryEaName[] = "MDCW.RECOVERY";

#pragma pack(push, 1)
struct RequestHeader {
  char magic[8];
  std::uint32_t version;
  std::uint32_t operation;
  std::uint32_t flags;
  std::uint32_t parent_bytes;
  std::uint32_t name_bytes;
  std::uint32_t input_deadline_ms;
  std::uint64_t max_bytes;
  std::uint64_t expected_parent_volume;
  std::uint8_t expected_parent_file_id[16];
  std::uint64_t expected_child_volume;
  std::uint8_t expected_child_file_id[16];
  std::uint64_t expected_child_size;
  std::int64_t expected_child_last_write;
};

struct ResponseHeader {
  char magic[8];
  std::uint32_t version;
  std::uint32_t type;
  std::uint32_t code;
  std::uint32_t message_bytes;
  std::uint64_t volume;
  std::uint8_t file_id[16];
  std::uint64_t size;
  std::int64_t last_write;
};
#pragma pack(pop)

static_assert(sizeof(RequestHeader) == 104);
static_assert(sizeof(ResponseHeader) == 64);

struct HandleCloser {
  void operator()(void* raw) const noexcept {
    HANDLE handle = static_cast<HANDLE>(raw);
    if (handle != nullptr && handle != INVALID_HANDLE_VALUE) CloseHandle(handle);
  }
};
using UniqueHandle = std::unique_ptr<void, HandleCloser>;

struct FileWitness {
  std::uint64_t volume = 0;
  std::array<std::uint8_t, 16> file_id{};
  std::uint64_t size = 0;
  std::int64_t last_write = 0;
  bool exists = false;
};

using NtCreateFileFn = NTSTATUS(NTAPI*)(
  PHANDLE,
  ACCESS_MASK,
  POBJECT_ATTRIBUTES,
  PIO_STATUS_BLOCK,
  PLARGE_INTEGER,
  ULONG,
  ULONG,
  ULONG,
  ULONG,
  PVOID,
  ULONG);
using NtSetInformationFileFn = NTSTATUS(NTAPI*)(
  HANDLE,
  PIO_STATUS_BLOCK,
  PVOID,
  ULONG,
  FILE_INFORMATION_CLASS);
using NtQueryEaFileFn = NTSTATUS(NTAPI*)(
  HANDLE,
  PIO_STATUS_BLOCK,
  PVOID,
  ULONG,
  BOOLEAN,
  PVOID,
  ULONG,
  PULONG,
  BOOLEAN);
using NtSetEaFileFn = NTSTATUS(NTAPI*)(HANDLE, PIO_STATUS_BLOCK, PVOID, ULONG);
using RtlNtStatusToDosErrorFn = ULONG(NTAPI*)(NTSTATUS);

struct NativeApi {
  NtCreateFileFn create_file = nullptr;
  NtSetInformationFileFn set_information = nullptr;
  NtQueryEaFileFn query_ea = nullptr;
  NtSetEaFileFn set_ea = nullptr;
  RtlNtStatusToDosErrorFn status_to_error = nullptr;
};

NativeApi LoadNativeApi() {
  HMODULE module = GetModuleHandleW(L"ntdll.dll");
  if (module == nullptr) return {};
  return {
    reinterpret_cast<NtCreateFileFn>(GetProcAddress(module, "NtCreateFile")),
    reinterpret_cast<NtSetInformationFileFn>(GetProcAddress(module, "NtSetInformationFile")),
    reinterpret_cast<NtQueryEaFileFn>(GetProcAddress(module, "NtQueryEaFile")),
    reinterpret_cast<NtSetEaFileFn>(GetProcAddress(module, "NtSetEaFile")),
    reinterpret_cast<RtlNtStatusToDosErrorFn>(GetProcAddress(module, "RtlNtStatusToDosError")),
  };
}

NativeApi g_native = LoadNativeApi();
#if defined(MDCW_TEST_FAULTS)
std::uint32_t g_test_transient_failures = 0;
std::uint32_t g_test_disposition_transient_failures = 0;
bool g_test_disposition_permanent_failure = false;
bool g_test_delete_permanent_failure = false;
#endif

std::uint32_t ErrorFromStatus(NTSTATUS status) {
  return g_native.status_to_error == nullptr ? ERROR_GEN_FAILURE : g_native.status_to_error(status);
}

bool NtSucceeded(NTSTATUS status) {
  return status >= 0;
}

bool DeadlineExpired(ULONGLONG deadline) {
  return GetTickCount64() >= deadline;
}

bool ReadExactWithDeadline(HANDLE input, void* output, std::size_t length, ULONGLONG deadline, std::uint32_t* error) {
  auto* bytes = static_cast<std::uint8_t*>(output);
  std::size_t offset = 0;
  while (offset < length) {
    if (DeadlineExpired(deadline)) {
      *error = WAIT_TIMEOUT;
      return false;
    }
    DWORD available = 0;
    if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) {
      DWORD pipe_error = GetLastError();
      if (pipe_error != ERROR_INVALID_HANDLE) {
        *error = pipe_error;
        return false;
      }
      available = static_cast<DWORD>(length - offset);
    }
    if (available == 0) {
      Sleep(2);
      continue;
    }
    DWORD read = 0;
    DWORD wanted = static_cast<DWORD>((std::min<std::size_t>)(length - offset, available));
    if (!ReadFile(input, bytes + offset, wanted, &read, nullptr) || read == 0) {
      *error = GetLastError() == ERROR_SUCCESS ? ERROR_BROKEN_PIPE : GetLastError();
      return false;
    }
    offset += read;
  }
  return true;
}

bool WriteExact(HANDLE output, const void* input, std::size_t length, std::uint32_t* error) {
  const auto* bytes = static_cast<const std::uint8_t*>(input);
  std::size_t offset = 0;
  while (offset < length) {
    DWORD written = 0;
    DWORD wanted = static_cast<DWORD>((std::min<std::size_t>)(length - offset, std::numeric_limits<DWORD>::max()));
    if (!WriteFile(output, bytes + offset, wanted, &written, nullptr) || written == 0) {
      *error = GetLastError() == ERROR_SUCCESS ? ERROR_WRITE_FAULT : GetLastError();
      return false;
    }
    offset += written;
  }
  return true;
}

bool SendResponse(HANDLE output, std::uint32_t type, std::uint32_t code, const FileWitness& witness, const std::string& message = {}) {
  if (message.size() > 4096) return false;
  ResponseHeader response{};
  std::memcpy(response.magic, kResponseMagic.data(), kResponseMagic.size());
  response.version = kProtocolVersion;
  response.type = type;
  response.code = code;
  response.message_bytes = static_cast<std::uint32_t>(message.size());
  response.volume = witness.volume;
  std::memcpy(response.file_id, witness.file_id.data(), witness.file_id.size());
  response.size = witness.size;
  response.last_write = witness.last_write;
  std::uint32_t error = ERROR_SUCCESS;
  return WriteExact(output, &response, sizeof(response), &error)
    && (message.empty() || WriteExact(output, message.data(), message.size(), &error));
}

std::wstring Utf8ToWide(const std::string& value) {
  if (value.empty()) return {};
  int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
  if (length <= 0) return {};
  std::wstring output(static_cast<std::size_t>(length), L'\0');
  if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), output.data(), length) != length) return {};
  return output;
}

std::string WideToUtf8(const std::wstring& value) {
  if (value.empty()) return {};
  int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (length <= 0) return {};
  std::string output(static_cast<std::size_t>(length), '\0');
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), output.data(), length, nullptr, nullptr) != length) return {};
  return output;
}

bool IsAsciiLetter(wchar_t value) {
  return (value >= L'a' && value <= L'z') || (value >= L'A' && value <= L'Z');
}

bool ValidParentComponents(const std::wstring& path, std::size_t start, std::size_t minimum_components) {
  std::size_t components = 0;
  while (start < path.size()) {
    std::size_t end = path.find(L'\\', start);
    if (end == std::wstring::npos) end = path.size();
    std::wstring segment = path.substr(start, end - start);
    if (segment.empty() || segment == L"." || segment == L".." || segment.back() == L'.' || segment.back() == L' ') return false;
    for (wchar_t value : segment) {
      if (value < 32 || value == L':' || value == L'<' || value == L'>' || value == L'"' || value == L'|' || value == L'?' || value == L'*') return false;
    }
    components += 1;
    if (end == path.size()) break;
    start = end + 1;
  }
  return components >= minimum_components;
}

bool DosPathToNtPath(const std::wstring& input, std::wstring* output) {
  if (input.empty() || input.size() > 32760 || input.find(L'/') != std::wstring::npos || input.rfind(L"\\\\.\\", 0) == 0) return false;
  std::wstring path = input;
  if (path.rfind(L"\\\\?\\UNC\\", 0) == 0) {
    if (!ValidParentComponents(path, 8, 2)) return false;
    path = L"\\??\\UNC\\" + path.substr(8);
  } else if (path.size() >= 7 && path.rfind(L"\\\\?\\", 0) == 0 && IsAsciiLetter(path[4]) && path[5] == L':' && path[6] == L'\\') {
    if (!ValidParentComponents(path, 7, 0)) return false;
    path = L"\\??\\" + path.substr(4);
  } else if (path.rfind(L"\\\\", 0) == 0) {
    if (!ValidParentComponents(path, 2, 2)) return false;
    path = L"\\??\\UNC\\" + path.substr(2);
  } else if (path.size() >= 3 && IsAsciiLetter(path[0]) && path[1] == L':' && path[2] == L'\\') {
    if (!ValidParentComponents(path, 3, 0)) return false;
    path = L"\\??\\" + path;
  } else {
    return false;
  }
  *output = std::move(path);
  return true;
}

bool IsReservedDeviceName(std::wstring name) {
  std::size_t dot = name.find(L'.');
  if (dot != std::wstring::npos) name.resize(dot);
  for (auto& value : name) if (value >= L'a' && value <= L'z') value = static_cast<wchar_t>(value - L'a' + L'A');
  if (name == L"CON" || name == L"PRN" || name == L"AUX" || name == L"NUL") return true;
  if (name.size() == 4 && (name.rfind(L"COM", 0) == 0 || name.rfind(L"LPT", 0) == 0) && name[3] >= L'1' && name[3] <= L'9') return true;
  return false;
}

bool ValidChildName(const std::wstring& name) {
  if (name.empty() || name.size() > 255 || name == L"." || name == L".." || name.back() == L'.' || name.back() == L' ') return false;
  for (wchar_t value : name) {
    if (value < 32 || value == L'\\' || value == L'/' || value == L':' || value == L'\0') return false;
  }
  return !IsReservedDeviceName(name);
}

UNICODE_STRING UnicodeView(const std::wstring& value) {
  UNICODE_STRING name{};
  name.Length = static_cast<USHORT>(value.size() * sizeof(wchar_t));
  name.MaximumLength = name.Length;
  name.Buffer = const_cast<PWSTR>(value.data());
  return name;
}

OBJECT_ATTRIBUTES ObjectAttributes(UNICODE_STRING* name, HANDLE root) {
  OBJECT_ATTRIBUTES attributes{};
  attributes.Length = sizeof(attributes);
  attributes.RootDirectory = root;
  attributes.ObjectName = name;
  attributes.Attributes = OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE;
  return attributes;
}

bool QueryWitness(HANDLE handle, FileWitness* witness, std::uint32_t* error) {
  FILE_ATTRIBUTE_TAG_INFO tag{};
  if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &tag, sizeof(tag))) {
    *error = GetLastError();
    return false;
  }
  if ((tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
    *error = ERROR_REPARSE_TAG_INVALID;
    return false;
  }
  FILE_ID_INFO id{};
  FILE_STANDARD_INFO standard{};
  FILE_BASIC_INFO basic{};
  if (!GetFileInformationByHandleEx(handle, FileIdInfo, &id, sizeof(id))
      || !GetFileInformationByHandleEx(handle, FileStandardInfo, &standard, sizeof(standard))
      || !GetFileInformationByHandleEx(handle, FileBasicInfo, &basic, sizeof(basic))) {
    *error = GetLastError();
    return false;
  }
  witness->exists = true;
  witness->volume = id.VolumeSerialNumber;
  std::memcpy(witness->file_id.data(), id.FileId.Identifier, witness->file_id.size());
  witness->size = standard.Directory ? 0 : static_cast<std::uint64_t>(standard.EndOfFile.QuadPart);
  witness->last_write = basic.LastWriteTime.QuadPart;
  return true;
}

bool SameObject(const FileWitness& witness, std::uint64_t volume, const std::uint8_t file_id[16]) {
  return witness.volume == volume && std::memcmp(witness.file_id.data(), file_id, witness.file_id.size()) == 0;
}

bool SameWitness(const FileWitness& left, const FileWitness& right) {
  return left.volume == right.volume && left.file_id == right.file_id
    && left.size == right.size && left.last_write == right.last_write;
}

std::string NativeIdentityMessage(const FileWitness& witness) {
  static constexpr char kHex[] = "0123456789abcdef";
  std::string message;
  for (int shift = 60; shift >= 0; shift -= 4) message.push_back(kHex[(witness.volume >> shift) & 15]);
  message.push_back(':');
  for (std::uint8_t value : witness.file_id) {
    message.push_back(kHex[value >> 4]);
    message.push_back(kHex[value & 15]);
  }
  return message;
}

int HexValue(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  return -1;
}

bool ParseNativeIdentity(const std::string& text, FileWitness* witness) {
  if (text.size() != 49 || text[16] != ':') return false;
  std::uint64_t volume = 0;
  for (std::size_t index = 0; index < 16; index += 1) {
    int digit = HexValue(text[index]);
    if (digit < 0) return false;
    volume = (volume << 4) | static_cast<std::uint64_t>(digit);
  }
  std::array<std::uint8_t, 16> file_id{};
  for (std::size_t index = 0; index < file_id.size(); index += 1) {
    int high = HexValue(text[17 + index * 2]);
    int low = HexValue(text[18 + index * 2]);
    if (high < 0 || low < 0) return false;
    file_id[index] = static_cast<std::uint8_t>((high << 4) | low);
  }
  witness->exists = true;
  witness->volume = volume;
  witness->file_id = file_id;
  return true;
}

using RecoveryCapability = std::array<std::uint8_t, kRecoveryCapabilityBytes>;

bool ParseRecoveryCapability(const std::string& text, RecoveryCapability* capability) {
  if (text.size() != capability->size() * 2) return false;
  for (std::size_t index = 0; index < capability->size(); index += 1) {
    int high = HexValue(text[index * 2]);
    int low = HexValue(text[index * 2 + 1]);
    if (high < 0 || low < 0) return false;
    (*capability)[index] = static_cast<std::uint8_t>((high << 4) | low);
  }
  return true;
}

struct EaInformationHeader {
  ULONG NextEntryOffset;
  UCHAR Flags;
  UCHAR EaNameLength;
  USHORT EaValueLength;
  CHAR EaName[1];
};

std::vector<std::uint8_t> RecoveryEaInformation(const RecoveryCapability& capability, bool clear) {
  constexpr std::size_t name_length = sizeof(kRecoveryEaName) - 1;
  std::size_t value_length = clear ? 0 : capability.size();
  std::vector<std::uint8_t> buffer(offsetof(EaInformationHeader, EaName) + name_length + 1 + value_length);
  auto* information = reinterpret_cast<EaInformationHeader*>(buffer.data());
  information->NextEntryOffset = 0;
  information->Flags = 0;
  information->EaNameLength = static_cast<UCHAR>(name_length);
  information->EaValueLength = static_cast<USHORT>(value_length);
  std::memcpy(information->EaName, kRecoveryEaName, name_length + 1);
  if (!clear) std::memcpy(information->EaName + name_length + 1, capability.data(), capability.size());
  return buffer;
}

bool VerifyRecoveryCapability(HANDLE file, const RecoveryCapability& capability, std::uint32_t* error) {
  if (g_native.query_ea == nullptr) {
    *error = ERROR_INVALID_FUNCTION;
    return false;
  }
  std::array<std::uint8_t, 1024> buffer{};
  IO_STATUS_BLOCK status_block{};
  NTSTATUS status = g_native.query_ea(file, &status_block, buffer.data(), static_cast<ULONG>(buffer.size()), FALSE, nullptr, 0, nullptr, TRUE);
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return false;
  }
  std::size_t used = static_cast<std::size_t>(status_block.Information);
  std::size_t offset = 0;
  while (offset + offsetof(EaInformationHeader, EaName) <= used) {
    auto* information = reinterpret_cast<const EaInformationHeader*>(buffer.data() + offset);
    std::size_t record_bytes = offsetof(EaInformationHeader, EaName) + information->EaNameLength + 1 + information->EaValueLength;
    if (record_bytes > used - offset) break;
    if (information->EaNameLength == sizeof(kRecoveryEaName) - 1
        && std::memcmp(information->EaName, kRecoveryEaName, sizeof(kRecoveryEaName) - 1) == 0
        && information->EaValueLength == capability.size()
        && std::memcmp(information->EaName + information->EaNameLength + 1, capability.data(), capability.size()) == 0) return true;
    if (information->NextEntryOffset == 0 || information->NextEntryOffset > used - offset) break;
    offset += information->NextEntryOffset;
  }
  *error = ERROR_FILE_INVALID;
  return false;
}

bool ClearRecoveryCapability(HANDLE file, const RecoveryCapability& capability, std::uint32_t* error) {
  if (g_native.set_ea == nullptr) {
    *error = ERROR_INVALID_FUNCTION;
    return false;
  }
  auto buffer = RecoveryEaInformation(capability, true);
  IO_STATUS_BLOCK status_block{};
  NTSTATUS status = g_native.set_ea(file, &status_block, buffer.data(), static_cast<ULONG>(buffer.size()));
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return false;
  }
  return true;
}

std::string ParentWitnessMessage(const FileWitness& witness) {
  return "parent:" + NativeIdentityMessage(witness);
}

UniqueHandle OpenParent(const std::wstring& dos_path, bool writable, std::uint32_t* error) {
  std::wstring nt_path;
  if (!DosPathToNtPath(dos_path, &nt_path) || g_native.create_file == nullptr) {
    *error = ERROR_INVALID_NAME;
    return {};
  }
  UNICODE_STRING name = UnicodeView(nt_path);
  OBJECT_ATTRIBUTES attributes = ObjectAttributes(&name, nullptr);
  IO_STATUS_BLOCK status_block{};
  HANDLE raw = INVALID_HANDLE_VALUE;
  ACCESS_MASK access = FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE;
  if (writable) access |= FILE_ADD_FILE | FILE_WRITE_ATTRIBUTES | DELETE;
  NTSTATUS status = g_native.create_file(
    &raw,
    access,
    &attributes,
    &status_block,
    nullptr,
    FILE_ATTRIBUTE_NORMAL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    FILE_OPEN,
    FILE_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT | FILE_OPEN_FOR_BACKUP_INTENT,
    nullptr,
    0);
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return {};
  }
  UniqueHandle handle(raw);
  FileWitness witness{};
  if (!QueryWitness(handle.get(), &witness, error)) return {};
  return handle;
}

enum class ChildDisposition { Open, Create };
enum class ChildAccess { Inspect, Replace, WriteNew };

UniqueHandle OpenChild(
  HANDLE parent,
  const std::wstring& child_name,
  ChildDisposition disposition,
  ChildAccess child_access,
  std::uint32_t* error,
  bool* missing = nullptr,
  const RecoveryCapability* recovery_capability = nullptr) {
  if (!ValidChildName(child_name) || g_native.create_file == nullptr) {
    *error = ERROR_INVALID_NAME;
    return {};
  }
  UNICODE_STRING name = UnicodeView(child_name);
  OBJECT_ATTRIBUTES attributes = ObjectAttributes(&name, parent);
  IO_STATUS_BLOCK status_block{};
  HANDLE raw = INVALID_HANDLE_VALUE;
  std::vector<std::uint8_t> ea_buffer;
  if (recovery_capability != nullptr) ea_buffer = RecoveryEaInformation(*recovery_capability, false);
  ACCESS_MASK access = FILE_READ_ATTRIBUTES | FILE_READ_EA | SYNCHRONIZE;
  if (child_access == ChildAccess::Replace) access |= FILE_WRITE_DATA | FILE_WRITE_ATTRIBUTES | DELETE;
  if (child_access == ChildAccess::WriteNew) access |= FILE_WRITE_DATA | FILE_WRITE_ATTRIBUTES | FILE_WRITE_EA | DELETE;
  NTSTATUS status = g_native.create_file(
    &raw,
    access,
    &attributes,
    &status_block,
    nullptr,
    FILE_ATTRIBUTE_NORMAL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    disposition == ChildDisposition::Create ? FILE_CREATE : FILE_OPEN,
    FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT
      | (child_access == ChildAccess::WriteNew ? FILE_WRITE_THROUGH : 0),
    ea_buffer.empty() ? nullptr : ea_buffer.data(),
    static_cast<ULONG>(ea_buffer.size()));
  if (!NtSucceeded(status)) {
    std::uint32_t mapped = ErrorFromStatus(status);
    if (missing != nullptr && (mapped == ERROR_FILE_NOT_FOUND || mapped == ERROR_PATH_NOT_FOUND)) *missing = true;
    *error = mapped;
    return {};
  }
  UniqueHandle handle(raw);
  FileWitness witness{};
  if (!QueryWitness(handle.get(), &witness, error)) return {};
  return handle;
}

std::wstring RandomChildName(const wchar_t* suffix, std::uint32_t* error) {
  std::array<std::uint8_t, 16> random{};
  NTSTATUS status = BCryptGenRandom(nullptr, random.data(), static_cast<ULONG>(random.size()), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return {};
  }
  static constexpr wchar_t kHex[] = L"0123456789abcdef";
  std::wstring name = L".material-designer-converter-";
  for (std::uint8_t value : random) {
    name.push_back(kHex[value >> 4]);
    name.push_back(kHex[value & 15]);
  }
  name += suffix;
  return name;
}

std::wstring RecoveryTemporaryName(const RecoveryCapability& capability) {
  static constexpr wchar_t kHex[] = L"0123456789abcdef";
  std::wstring name = L".material-designer-converter-";
  for (std::uint8_t value : capability) {
    name.push_back(kHex[value >> 4]);
    name.push_back(kHex[value & 15]);
  }
  name += L".tmp";
  return name;
}

template <typename Header>
std::vector<std::uint8_t> NameInformation(const std::wstring& name) {
  std::size_t name_bytes = name.size() * sizeof(wchar_t);
  std::vector<std::uint8_t> buffer(offsetof(Header, FileName) + name_bytes);
  auto* information = reinterpret_cast<Header*>(buffer.data());
  information->RootDirectory = nullptr;
  information->FileNameLength = static_cast<ULONG>(name_bytes);
  std::memcpy(information->FileName, name.data(), name_bytes);
  return buffer;
}

struct RenameInformation {
  ULONG Flags;
  HANDLE RootDirectory;
  ULONG FileNameLength;
  WCHAR FileName[1];
};

bool TransientSharingError(std::uint32_t error) {
  return error == ERROR_SHARING_VIOLATION || error == ERROR_LOCK_VIOLATION
    || error == ERROR_ACCESS_DENIED || error == ERROR_USER_MAPPED_FILE;
}

bool RenameRelative(HANDLE file, HANDLE parent, const std::wstring& name, bool replace, std::uint32_t* error) {
  if (g_native.set_information == nullptr || !ValidChildName(name)) {
    *error = ERROR_INVALID_FUNCTION;
    return false;
  }
  auto buffer = NameInformation<RenameInformation>(name);
  auto* information = reinterpret_cast<RenameInformation*>(buffer.data());
  information->Flags = replace ? FILE_RENAME_REPLACE_IF_EXISTS | FILE_RENAME_POSIX_SEMANTICS : 0;
  information->RootDirectory = parent;
  IO_STATUS_BLOCK status_block{};
  for (std::uint32_t attempt = 0; attempt < kRetryAttempts; attempt += 1) {
    NTSTATUS status = g_native.set_information(file, &status_block, information, static_cast<ULONG>(buffer.size()), static_cast<FILE_INFORMATION_CLASS>(65));
    if (NtSucceeded(status)) return true;
    *error = ErrorFromStatus(status);
    if (!TransientSharingError(*error) || attempt + 1 == kRetryAttempts) return false;
    Sleep(20U * (attempt + 1U));
  }
  return false;
}

bool SetDeleteOnClose(HANDLE file, bool enabled, std::uint32_t* error) {
  if (g_native.set_information == nullptr) {
    *error = ERROR_INVALID_FUNCTION;
    return false;
  }
  for (std::uint32_t attempt = 0; attempt < kRetryAttempts; attempt += 1) {
#if defined(MDCW_TEST_FAULTS)
    if (enabled && g_test_disposition_permanent_failure) {
      *error = ERROR_INVALID_FUNCTION;
      return false;
    }
    if (enabled && g_test_disposition_transient_failures > 0) {
      g_test_disposition_transient_failures -= 1;
      *error = ERROR_SHARING_VIOLATION;
      Sleep(20U * (attempt + 1U));
      continue;
    }
#endif
    IO_STATUS_BLOCK status_block{};
    struct DispositionInformation { BOOLEAN DeleteFile; } information{static_cast<BOOLEAN>(enabled ? TRUE : FALSE)};
    NTSTATUS status = g_native.set_information(file, &status_block, &information, sizeof(information), static_cast<FILE_INFORMATION_CLASS>(13));
    if (NtSucceeded(status)) return true;
    *error = ErrorFromStatus(status);
    if (!TransientSharingError(*error) || attempt + 1 == kRetryAttempts) return false;
    Sleep(20U * (attempt + 1U));
  }
  return false;
}

bool DeleteHandle(HANDLE file, std::uint32_t* error) {
  if (g_native.set_information == nullptr) {
    *error = ERROR_INVALID_FUNCTION;
    return false;
  }
  struct DispositionInformation { ULONG Flags; } information{
    FILE_DISPOSITION_DELETE | FILE_DISPOSITION_POSIX_SEMANTICS | FILE_DISPOSITION_IGNORE_READONLY_ATTRIBUTE,
  };
  IO_STATUS_BLOCK status_block{};
  for (std::uint32_t attempt = 0; attempt < kRetryAttempts; attempt += 1) {
#if defined(MDCW_TEST_FAULTS)
    if (g_test_delete_permanent_failure) {
      *error = ERROR_ACCESS_DENIED;
      return false;
    }
    if (g_test_transient_failures > 0) {
      g_test_transient_failures -= 1;
      *error = ERROR_SHARING_VIOLATION;
      Sleep(20U * (attempt + 1U));
      continue;
    }
#endif
    NTSTATUS status = g_native.set_information(file, &status_block, &information, sizeof(information), static_cast<FILE_INFORMATION_CLASS>(64));
    if (NtSucceeded(status)) return true;
    *error = ErrorFromStatus(status);
    if (!TransientSharingError(*error) || attempt + 1 == kRetryAttempts) return false;
    Sleep(20U * (attempt + 1U));
  }
  return false;
}

bool WaitForTestRelease(HANDLE input, ULONGLONG input_deadline, std::uint32_t* error) {
#if defined(MDCW_TEST_FAULTS)
  std::uint8_t release = 0;
  return ReadExactWithDeadline(input, &release, sizeof(release), input_deadline, error) && release == kActionContinue;
#else
  (void)input;
  (void)input_deadline;
  *error = ERROR_INVALID_FUNCTION;
  return false;
#endif
}

bool WritePayload(
  HANDLE input,
  HANDLE response_output,
  HANDLE output_file,
  const std::wstring& temporary_name,
  std::uint64_t max_bytes,
  ULONGLONG deadline,
  std::uint32_t flags,
  bool* cancelled,
  std::uint32_t* error) {
  std::uint64_t total = 0;
  std::vector<std::uint8_t> chunk;
  for (;;) {
    std::uint32_t length = 0;
    if (!ReadExactWithDeadline(input, &length, sizeof(length), deadline, error)) return false;
    if (length == kCancelChunk) {
      *cancelled = true;
      return false;
    }
    if (length == 0) break;
    if (length > kMaxChunkBytes || total > max_bytes || length > max_bytes - total) {
      *error = ERROR_FILE_TOO_LARGE;
      return false;
    }
    chunk.resize(length);
    if (!ReadExactWithDeadline(input, chunk.data(), chunk.size(), deadline, error)) return false;
    std::size_t offset = 0;
    while (offset < chunk.size()) {
      DWORD written = 0;
      if (!WriteFile(output_file, chunk.data() + offset, static_cast<DWORD>(chunk.size() - offset), &written, nullptr) || written == 0) {
        *error = GetLastError() == ERROR_SUCCESS ? ERROR_WRITE_FAULT : GetLastError();
        return false;
      }
      offset += written;
    }
    total += length;
  }
#if defined(MDCW_TEST_FAULTS)
  if ((flags & kFlagTestPauseAfterFlush) != 0) {
    FileWitness preflush_witness{};
    if (!QueryWitness(output_file, &preflush_witness, error)
        || !SendResponse(response_output, kResponseProgress, 6, preflush_witness, "preflush:" + WideToUtf8(temporary_name))
        || !WaitForTestRelease(input, deadline, error)) return false;
  }
#else
  (void)response_output;
  (void)temporary_name;
  (void)flags;
#endif
  if (!FlushFileBuffers(output_file)) {
    *error = GetLastError();
    return false;
  }
  return true;
}

struct RecoveryNames {
  std::wstring remnant;
  std::wstring target;
  RecoveryCapability capability{};
  FileWitness promoted;
  bool has_capability = false;
  bool has_target = false;
  bool has_promoted = false;
};

bool ParseRecoveryNames(const std::string& encoded, RecoveryNames* names) {
  std::size_t first = encoded.find('\n');
  if (first == std::string::npos) {
    names->remnant = Utf8ToWide(encoded);
    return ValidChildName(names->remnant);
  }
  std::size_t second = encoded.find('\n', first + 1);
  if (second == std::string::npos) {
    names->remnant = Utf8ToWide(encoded.substr(0, first));
    names->has_capability = ParseRecoveryCapability(encoded.substr(first + 1), &names->capability);
    return ValidChildName(names->remnant) && names->has_capability;
  }
  if (encoded.find('\n', second + 1) != std::string::npos) return false;
  names->remnant = Utf8ToWide(encoded.substr(0, first));
  names->target = Utf8ToWide(encoded.substr(first + 1, second - first - 1));
  std::string promoted = encoded.substr(second + 1);
  names->has_target = true;
  names->has_promoted = !promoted.empty();
  return ValidChildName(names->remnant) && ValidChildName(names->target)
    && (!names->has_promoted || ParseNativeIdentity(promoted, &names->promoted));
}

int RecoverRemnant(
  HANDLE output,
  HANDLE parent,
  const FileWitness& parent_witness,
  const RecoveryNames& names,
  const RequestHeader& request,
  std::uint32_t* error) {
  bool remnant_missing = false;
  UniqueHandle remnant = OpenChild(parent, names.remnant, ChildDisposition::Open, ChildAccess::Replace, error, &remnant_missing);
  if (!remnant && !remnant_missing) {
    SendResponse(output, kResponseError, *error, parent_witness, "The authenticated recovery entry could not be opened.");
    return 23;
  }
  FileWitness remnant_witness{};
  bool identity_matches = remnant && (request.flags & kFlagExpectedChild) != 0
    && QueryWitness(remnant.get(), &remnant_witness, error)
    && SameObject(remnant_witness, request.expected_child_volume, request.expected_child_file_id);
  bool capability_matches = remnant && (request.flags & kFlagRecoveryCapability) != 0
    && names.has_capability && VerifyRecoveryCapability(remnant.get(), names.capability, error);
  if (remnant && !identity_matches && !capability_matches) {
    SendResponse(output, kResponseError, ERROR_FILE_INVALID, remnant_witness, "Recovery refused an entry whose native identity or creation capability did not match its receipt.");
    return 24;
  }
  if (!names.has_target) {
    if (remnant_missing) {
      SendResponse(output, kResponseResult, 0, parent_witness, "The authenticated recovery entry was already absent.");
      return 0;
    }
    if (!DeleteHandle(remnant.get(), error)) {
      SendResponse(output, kResponseError, *error, remnant_witness, "Authenticated temporary cleanup exhausted its bounded sharing retries.");
      return 25;
    }
    SendResponse(output, kResponseResult, 1, parent_witness);
    return 0;
  }

  bool target_missing = false;
  UniqueHandle target = OpenChild(parent, names.target, ChildDisposition::Open, ChildAccess::Replace, error, &target_missing);
  FileWitness target_witness{};
  if (target && !QueryWitness(target.get(), &target_witness, error)) {
    SendResponse(output, kResponseError, *error, remnant_witness, "The recovery target could not be inspected.");
    return 26;
  }
  if (!target && !target_missing) {
    SendResponse(output, kResponseError, *error, remnant_witness, "The recovery target could not be opened safely.");
    return 27;
  }
  if (remnant_missing) {
    if (target_missing) {
      if ((request.flags & kFlagRecoveryTemporary) != 0) {
        SendResponse(output, kResponseResult, 0, parent_witness, "The authenticated temporary transition was already cleaned.");
        return 0;
      }
      SendResponse(output, kResponseError, ERROR_FILE_NOT_FOUND, parent_witness, "Recovery found neither side of the authenticated namespace transition.");
      return 28;
    }
    bool target_is_remnant = SameObject(target_witness, request.expected_child_volume, request.expected_child_file_id);
    bool target_is_promoted = names.has_promoted && SameObject(target_witness, names.promoted.volume, names.promoted.file_id.data());
    if (!target_is_remnant && !target_is_promoted) {
      SendResponse(output, kResponseError, ERROR_FILE_INVALID, target_witness, "Recovery left an independently substituted destination untouched.");
      return 29;
    }
    if ((request.flags & kFlagRecoveryRollback) != 0 && !target_is_remnant) {
      SendResponse(output, kResponseError, ERROR_FILE_NOT_FOUND, target_witness, "Rollback recovery could not locate the authenticated original.");
      return 30;
    }
    SendResponse(output, kResponseResult, 1, target_witness, "The authenticated namespace transition was already complete.");
    return 0;
  }
  if (target_missing) {
    if (!RenameRelative(remnant.get(), parent, names.target, false, error) || !FlushFileBuffers(remnant.get())) {
      SendResponse(output, kResponseError, *error, remnant_witness, "The authenticated original could not be restored to an empty destination.");
      return 30;
    }
    SendResponse(output, kResponseResult, 1, remnant_witness);
    return 0;
  }
  if (SameObject(target_witness, request.expected_child_volume, request.expected_child_file_id)) {
    if (!DeleteHandle(remnant.get(), error)) {
      SendResponse(output, kResponseError, *error, remnant_witness, "Recovery could not retire a duplicate authenticated namespace entry.");
      return 31;
    }
    SendResponse(output, kResponseResult, 1, target_witness);
    return 0;
  }
  if (!names.has_promoted || !SameObject(target_witness, names.promoted.volume, names.promoted.file_id.data())) {
    SendResponse(output, kResponseError, ERROR_FILE_INVALID, target_witness, "Recovery left an independently substituted destination untouched.");
    return 32;
  }
  if ((request.flags & kFlagRecoveryRollback) != 0) {
    if (!DeleteHandle(target.get(), error)) {
      SendResponse(output, kResponseError, *error, target_witness, "Recovery could not remove the exact failed promotion after bounded sharing retries.");
      return 33;
    }
    target.reset();
    if (!RenameRelative(remnant.get(), parent, names.target, false, error) || !FlushFileBuffers(remnant.get())) {
      SendResponse(output, kResponseError, *error, remnant_witness, "Recovery preserved the original because its exact rollback could not finish.");
      return 34;
    }
    SendResponse(output, kResponseResult, 1, remnant_witness);
    return 0;
  }
  if (!DeleteHandle(remnant.get(), error)) {
    SendResponse(output, kResponseError, *error, remnant_witness, "Recovery could not retire the authenticated rollback entry after bounded sharing retries.");
    return 35;
  }
  SendResponse(output, kResponseResult, 1, target_witness);
  return 0;
}

int Run() {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (input == nullptr || input == INVALID_HANDLE_VALUE || output == nullptr || output == INVALID_HANDLE_VALUE
      || g_native.create_file == nullptr || g_native.set_information == nullptr || g_native.query_ea == nullptr
      || g_native.set_ea == nullptr || g_native.status_to_error == nullptr) return 111;

  RequestHeader request{};
  std::uint32_t error = ERROR_SUCCESS;
  ULONGLONG initial_deadline = GetTickCount64() + kMaxDeadlineMs;
  if (!ReadExactWithDeadline(input, &request, sizeof(request), initial_deadline, &error)) {
    SendResponse(output, kResponseError, error, {}, "The writer request header could not be read.");
    return 2;
  }
  if (std::memcmp(request.magic, kRequestMagic.data(), kRequestMagic.size()) != 0
      || request.version != kProtocolVersion
      || (request.operation != kOperationInspectParent && request.operation != kOperationInspectChild
        && request.operation != kOperationWrite && request.operation != kOperationRecover)
      || (request.flags & ~kKnownFlags) != 0
      || request.parent_bytes == 0 || request.parent_bytes > kMaxParentBytes
      || request.name_bytes > kMaxNameBytes
      || request.input_deadline_ms < kMinDeadlineMs || request.input_deadline_ms > kMaxDeadlineMs
      || request.max_bytes > kMaxOutputBytes
      || (request.operation != kOperationInspectParent && request.name_bytes == 0)
      || ((request.flags & kFlagReplace) != 0 && (request.flags & kFlagExpectedChild) == 0)
      || ((request.flags & kFlagExpectedChild) != 0 && request.operation != kOperationWrite && request.operation != kOperationRecover)
      || (request.operation == kOperationRecover && ((request.flags & kFlagExpectedParent) == 0
        || ((request.flags & kFlagExpectedChild) == 0 && (request.flags & kFlagRecoveryCapability) == 0)))
      || ((request.flags & kFlagRecoveryRollback) != 0 && (request.operation != kOperationRecover || (request.flags & kFlagReplace) == 0))
      || ((request.flags & kFlagRecoveryTemporary) != 0 && request.operation != kOperationRecover)
      || ((request.flags & kFlagRecoveryRollback) != 0 && (request.flags & kFlagRecoveryTemporary) != 0)
      || ((request.flags & kFlagRecoveryCapability) != 0 && request.operation != kOperationWrite && request.operation != kOperationRecover)) {
    SendResponse(output, kResponseError, ERROR_INVALID_DATA, {}, "The writer request is outside the fixed protocol contract.");
    return 3;
  }

  ULONGLONG input_deadline = GetTickCount64() + request.input_deadline_ms;
  std::string parent_utf8(request.parent_bytes, '\0');
  std::string name_utf8(request.name_bytes, '\0');
  if (!ReadExactWithDeadline(input, parent_utf8.data(), parent_utf8.size(), input_deadline, &error)
      || (!name_utf8.empty() && !ReadExactWithDeadline(input, name_utf8.data(), name_utf8.size(), input_deadline, &error))) {
    SendResponse(output, kResponseError, error, {}, "The writer request names could not be read.");
    return 4;
  }
  std::wstring parent_path = Utf8ToWide(parent_utf8);
  RecoveryNames recovery_names{};
  RecoveryCapability write_capability{};
  std::wstring child_name;
  bool names_valid = false;
  if (request.operation == kOperationRecover) {
    names_valid = ParseRecoveryNames(name_utf8, &recovery_names);
  } else if (request.operation == kOperationWrite) {
    std::size_t separator = name_utf8.find('\n');
    names_valid = separator != std::string::npos && name_utf8.find('\n', separator + 1) == std::string::npos;
    if (names_valid) {
      child_name = Utf8ToWide(name_utf8.substr(0, separator));
      names_valid = ValidChildName(child_name)
        && ParseRecoveryCapability(name_utf8.substr(separator + 1), &write_capability)
        && (request.flags & kFlagRecoveryCapability) != 0;
    }
  } else {
    child_name = name_utf8.empty() ? std::wstring{} : Utf8ToWide(name_utf8);
    names_valid = name_utf8.empty() || ValidChildName(child_name);
  }
  if (request.operation == kOperationRecover
      && (((request.flags & kFlagReplace) != 0) != recovery_names.has_target)) names_valid = false;
  if (request.operation == kOperationRecover
      && (((request.flags & kFlagRecoveryCapability) != 0) != recovery_names.has_capability)) names_valid = false;
  if (parent_path.empty() || !names_valid) {
    SendResponse(output, kResponseError, ERROR_INVALID_NAME, {}, "The writer accepts one absolute parent and one validated basename.");
    return 5;
  }

  bool writable = request.operation == kOperationWrite || request.operation == kOperationRecover;
  UniqueHandle parent = OpenParent(parent_path, writable, &error);
  FileWitness parent_witness{};
  if (!parent || !QueryWitness(parent.get(), &parent_witness, &error)) {
    SendResponse(output, kResponseError, error, {}, "The approved parent could not be opened without reparse traversal.");
    return 6;
  }
  if ((request.flags & kFlagExpectedParent) != 0 && !SameObject(parent_witness, request.expected_parent_volume, request.expected_parent_file_id)) {
    SendResponse(output, kResponseError, ERROR_FILE_INVALID, parent_witness, "The approved parent identity changed before the writer opened it.");
    return 7;
  }
  if (request.operation == kOperationInspectParent) {
    SendResponse(output, kResponseResult, 1, parent_witness);
    return 0;
  }
  if (request.operation == kOperationRecover) {
    return RecoverRemnant(output, parent.get(), parent_witness, recovery_names, request, &error);
  }

  bool child_missing = false;
  UniqueHandle child = OpenChild(
    parent.get(),
    child_name,
    ChildDisposition::Open,
    request.operation == kOperationWrite && (request.flags & kFlagReplace) != 0 ? ChildAccess::Replace : ChildAccess::Inspect,
    &error,
    &child_missing);
  FileWitness child_witness{};
  if (child && !QueryWitness(child.get(), &child_witness, &error)) {
    SendResponse(output, kResponseError, error, {}, "The destination child could not be inspected safely.");
    return 8;
  }
  if (request.operation == kOperationInspectChild) {
    if (!child && !child_missing) {
      SendResponse(output, kResponseError, error, {}, "The destination child could not be inspected safely.");
      return 9;
    }
    SendResponse(output, kResponseResult, child ? 1U : 0U, child_witness, ParentWitnessMessage(parent_witness));
    return 0;
  }
  if ((request.flags & kFlagReplace) == 0 && child) {
    SendResponse(output, kResponseError, ERROR_FILE_EXISTS, child_witness, "The destination already exists and no replacement was authorized.");
    return 10;
  }
  if ((request.flags & kFlagReplace) != 0) {
    if (!child || !SameObject(child_witness, request.expected_child_volume, request.expected_child_file_id)
        || child_witness.size != request.expected_child_size || child_witness.last_write != request.expected_child_last_write) {
      SendResponse(output, kResponseError, ERROR_FILE_INVALID, child_witness, "The authorized destination identity changed before replacement.");
      return 11;
    }
  }

  if (!SendResponse(output, kResponseOpened, 0, parent_witness)) return 12;
  std::uint8_t action = 0;
  if (!ReadExactWithDeadline(input, &action, sizeof(action), input_deadline, &error)) {
    SendResponse(output, kResponseError, error, parent_witness, "The writer open acknowledgement timed out.");
    return 13;
  }
  if (action == kActionCancel) {
    SendResponse(output, kResponseCancelled, ERROR_CANCELLED, parent_witness, "The write was cancelled before temporary creation.");
    return 0;
  }
  if (action != kActionContinue) {
    SendResponse(output, kResponseError, ERROR_INVALID_DATA, parent_witness, "The writer received an invalid open acknowledgement.");
    return 14;
  }

  std::wstring temporary_name = RecoveryTemporaryName(write_capability);
  UniqueHandle temporary = OpenChild(parent.get(), temporary_name, ChildDisposition::Create, ChildAccess::WriteNew, &error, nullptr, &write_capability);
  if (!temporary) {
    SendResponse(output, kResponseError, error, parent_witness, "The temporary child could not be created relative to the approved parent.");
    return 16;
  }
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestPauseAfterCreateBeforeIntent) != 0) {
    if (!SendResponse(output, kResponseProgress, 11, parent_witness, "test-created-before-intent")
        || !WaitForTestRelease(input, input_deadline, &error)) return 126;
  }
#endif
  FileWitness temporary_witness{};
  if (!QueryWitness(temporary.get(), &temporary_witness, &error)
      || !SendResponse(output, kResponseProgress, 1, temporary_witness, "temp-intent:" + WideToUtf8(temporary_name))) {
    std::uint32_t cleanup_error = ERROR_SUCCESS;
    DeleteHandle(temporary.get(), &cleanup_error);
    SendResponse(output, kResponseError, error, parent_witness, "The authenticated temporary intent receipt could not be emitted.");
    return 17;
  }
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestInitialDispositionTransient) != 0) g_test_disposition_transient_failures = 3;
  if ((request.flags & kFlagTestInitialDispositionPermanent) != 0
      || (request.flags & kFlagTestInitialCleanupPermanent) != 0) g_test_disposition_permanent_failure = true;
  if ((request.flags & kFlagTestInitialCleanupPermanent) != 0) g_test_delete_permanent_failure = true;
#endif
  if (!SetDeleteOnClose(temporary.get(), true, &error)) {
    std::uint32_t disposition_error = error;
    std::uint32_t cleanup_error = ERROR_SUCCESS;
    bool cleaned = DeleteHandle(temporary.get(), &cleanup_error);
    if (!cleaned) SendResponse(output, kResponseProgress, 1, temporary_witness, "temp-recovery:" + WideToUtf8(temporary_name));
    SendResponse(output, kResponseError, cleaned ? disposition_error : cleanup_error, temporary_witness, cleaned
      ? "The temporary could not become delete-pending, so its exact handle was removed and the write was refused."
      : "The temporary could not become delete-pending or complete exact cleanup. Its authenticated recovery receipt remains active.");
    return 18;
  }
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestInitialDispositionTransient) != 0) {
    SendResponse(output, kResponseProgress, 10, temporary_witness, "test-initial-disposition-retry");
  }
  g_test_disposition_permanent_failure = false;
  g_test_delete_permanent_failure = false;
#endif
  if (!SendResponse(output, kResponseProgress, 1, temporary_witness, "temp:" + WideToUtf8(temporary_name))) return 19;
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestPauseAfterTemp) != 0 && !WaitForTestRelease(input, input_deadline, &error)) return 118;
#endif
  bool temporary_named = true;
  auto cleanup_temporary = [&]() {
    if (temporary_named && temporary) {
      std::uint32_t ignored = ERROR_SUCCESS;
      SetDeleteOnClose(temporary.get(), true, &ignored);
      DeleteHandle(temporary.get(), &ignored);
    }
  };
  bool cancelled = false;
  if (!WritePayload(input, output, temporary.get(), temporary_name, request.max_bytes, input_deadline, request.flags, &cancelled, &error)) {
    cleanup_temporary();
    SendResponse(output, cancelled ? kResponseCancelled : kResponseError, cancelled ? ERROR_CANCELLED : error, parent_witness, cancelled ? "The write was cancelled and its temporary child was removed." : "The bounded output stream could not be written and flushed.");
    return cancelled ? 0 : 20;
  }
  if (!QueryWitness(temporary.get(), &temporary_witness, &error)
      || !SendResponse(output, kResponseProgress, 2, temporary_witness, "flushed:" + WideToUtf8(temporary_name))) {
    cleanup_temporary();
    return 21;
  }
  std::wstring backup_name;
  bool backup_named = false;
  if ((request.flags & kFlagReplace) != 0) {
    backup_name = RandomChildName(L".backup", &error);
    if (backup_name.empty()
        || !SendResponse(output, kResponseProgress, 3, child_witness, "backup-intent:" + WideToUtf8(backup_name))) {
      cleanup_temporary();
      SendResponse(output, kResponseError, error, child_witness, "The authenticated rollback intent could not be emitted before namespace mutation.");
      return 22;
    }
    if (!RenameRelative(child.get(), parent.get(), backup_name, false, &error)) {
      cleanup_temporary();
      SendResponse(output, kResponseError, error, child_witness, "The exact authorized destination could not enter the fail-closed rollback slot.");
      return 23;
    }
    backup_named = true;
#if defined(MDCW_TEST_FAULTS)
    if ((request.flags & kFlagTestPauseBackupIntentInterval) != 0) {
      if (!SendResponse(output, kResponseProgress, 8, child_witness, "test-backup-mutated")
          || !WaitForTestRelease(input, input_deadline, &error)) return 124;
    }
#endif
    FileWitness backup_witness{};
    if (!QueryWitness(child.get(), &backup_witness, &error)
        || !SendResponse(output, kResponseProgress, 3, backup_witness, "backup:" + WideToUtf8(backup_name))) {
      cleanup_temporary();
      RenameRelative(child.get(), parent.get(), child_name, false, &error);
      return 24;
    }
#if defined(MDCW_TEST_FAULTS)
    if ((request.flags & kFlagTestPauseAfterBackup) != 0 && !WaitForTestRelease(input, input_deadline, &error)) return 120;
#endif
    if (!SameWitness(child_witness, backup_witness)) {
      cleanup_temporary();
      if (RenameRelative(child.get(), parent.get(), child_name, false, &error) && FlushFileBuffers(child.get())) backup_named = false;
      SendResponse(output, kResponseError, ERROR_FILE_INVALID, backup_witness, "The exact authorized destination changed after acknowledgement, so promotion was refused.");
      return 25;
    }
  }

  if (!SendResponse(output, kResponseProgress, 4, temporary_witness, "promotion-intent:" + WideToUtf8(temporary_name))) {
    cleanup_temporary();
    if (backup_named && RenameRelative(child.get(), parent.get(), child_name, false, &error) && FlushFileBuffers(child.get())) backup_named = false;
    return 26;
  }
  if (!ClearRecoveryCapability(temporary.get(), write_capability, &error)) {
    cleanup_temporary();
    if (backup_named) {
      if (RenameRelative(child.get(), parent.get(), child_name, false, &error) && FlushFileBuffers(child.get())) backup_named = false;
    }
    SendResponse(output, kResponseError, error, child_witness, "The authenticated creation capability could not be cleared before promotion.");
    return 33;
  }
  if (!SetDeleteOnClose(temporary.get(), false, &error)) {
    cleanup_temporary();
    if (backup_named) {
      if (RenameRelative(child.get(), parent.get(), child_name, false, &error) && FlushFileBuffers(child.get())) backup_named = false;
    }
    SendResponse(output, kResponseError, error, child_witness, "The crash-safe temporary transition could not begin.");
    return 33;
  }
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestPausePromotionTransition) != 0) {
    if (!SendResponse(output, kResponseProgress, 6, temporary_witness, "transition")
        || !WaitForTestRelease(input, input_deadline, &error)) return 121;
  }
#endif

  if (!RenameRelative(temporary.get(), parent.get(), child_name, false, &error)) {
    SetDeleteOnClose(temporary.get(), true, &error);
    cleanup_temporary();
    if (backup_named && RenameRelative(child.get(), parent.get(), child_name, false, &error) && FlushFileBuffers(child.get())) backup_named = false;
    SendResponse(output, kResponseError, error, child_witness, backup_named
      ? "Promotion found another destination entry. It was left untouched and the authenticated original remains recoverable."
      : "Atomic no-replace promotion was refused and the authenticated original was restored.");
    return 34;
  }
  temporary_named = false;
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestPausePromotionIntentInterval) != 0) {
    if (!SendResponse(output, kResponseProgress, 9, temporary_witness, "test-promotion-mutated")
        || !WaitForTestRelease(input, input_deadline, &error)) return 125;
  }
#endif

  FileWitness promoted_witness{};
  bool promotion_ok = FlushFileBuffers(temporary.get()) && QueryWitness(temporary.get(), &promoted_witness, &error);
  if (promotion_ok && backup_named) {
    FileWitness retained_original{};
    promotion_ok = QueryWitness(child.get(), &retained_original, &error) && SameWitness(child_witness, retained_original);
    if (!promotion_ok && error == ERROR_SUCCESS) error = ERROR_FILE_INVALID;
  }
  if (promotion_ok) promotion_ok = SendResponse(output, kResponseProgress, 4, promoted_witness, "promoted");
#if defined(MDCW_TEST_FAULTS)
  if (promotion_ok && (request.flags & kFlagTestPauseAfterPromotion) != 0 && !WaitForTestRelease(input, input_deadline, &error)) return 122;
  if ((request.flags & kFlagTestRollback) != 0) promotion_ok = false;
#endif
  if (!promotion_ok) {
    std::uint32_t rollback_error = error == ERROR_SUCCESS ? ERROR_WRITE_FAULT : error;
    if (backup_named) {
      SendResponse(output, kResponseProgress, 5, child_witness, "rollback");
#if defined(MDCW_TEST_FAULTS)
      if ((request.flags & kFlagTestPauseRollback) != 0 && !WaitForTestRelease(input, input_deadline, &rollback_error)) return 123;
#endif
      if (DeleteHandle(temporary.get(), &rollback_error)) {
        temporary.reset();
      }
      if (!temporary && RenameRelative(child.get(), parent.get(), child_name, false, &rollback_error) && FlushFileBuffers(child.get())) {
        backup_named = false;
      }
    }
    SendResponse(output, kResponseError, rollback_error, child_witness, backup_named
      ? "The failed promotion was isolated, but an independent destination entry prevented exact rollback and was left untouched."
      : "The promoted file could not be validated, so the exact authorized original was restored.");
    return 35;
  }

  if (backup_named) {
#if defined(MDCW_TEST_FAULTS)
    if ((request.flags & kFlagTestSharingRetries) != 0) {
      g_test_transient_failures = 3;
      SendResponse(output, kResponseProgress, 7, child_witness, "sharing-retry");
    }
#endif
    if (!DeleteHandle(child.get(), &error)) {
      SendResponse(output, kResponseError, error, promoted_witness, "The output was promoted, but bounded rollback-slot cleanup exhausted its sharing retries.");
      return 36;
    }
    backup_named = false;
  }
  SendResponse(output, kResponseResult, 1, promoted_witness);
  return 0;
}

}  // namespace

int wmain() {
  return Run();
}
