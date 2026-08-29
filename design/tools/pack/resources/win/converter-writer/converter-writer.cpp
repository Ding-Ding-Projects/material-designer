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

namespace {

constexpr std::array<char, 8> kRequestMagic{'M', 'D', 'C', 'W', 'R', 'E', 'Q', '1'};
constexpr std::array<char, 8> kResponseMagic{'M', 'D', 'C', 'W', 'R', 'E', 'S', '1'};
constexpr std::uint32_t kProtocolVersion = 1;
constexpr std::uint32_t kOperationInspectParent = 1;
constexpr std::uint32_t kOperationInspectChild = 2;
constexpr std::uint32_t kOperationWrite = 3;
constexpr std::uint32_t kFlagExpectedParent = 1U << 0;
constexpr std::uint32_t kFlagExpectedChild = 1U << 1;
constexpr std::uint32_t kFlagReplace = 1U << 2;
#if defined(MDCW_TEST_FAULTS)
constexpr std::uint32_t kFlagTestRollback = 1U << 3;
#endif
constexpr std::uint32_t kKnownFlags = kFlagExpectedParent | kFlagExpectedChild | kFlagReplace
#if defined(MDCW_TEST_FAULTS)
  | kFlagTestRollback
#endif
  ;
constexpr std::uint32_t kResponseOpened = 1;
constexpr std::uint32_t kResponseResult = 2;
constexpr std::uint32_t kResponseError = 3;
constexpr std::uint32_t kResponseCancelled = 4;
constexpr std::uint8_t kActionContinue = 1;
constexpr std::uint8_t kActionCancel = 2;
constexpr std::uint32_t kCancelChunk = 0xffffffffU;
constexpr std::uint32_t kMaxParentBytes = 32U * 1024U;
constexpr std::uint32_t kMaxNameBytes = 1024U;
constexpr std::uint32_t kMaxChunkBytes = 1024U * 1024U;
constexpr std::uint64_t kMaxOutputBytes = 512ULL * 1024ULL * 1024ULL;
constexpr std::uint32_t kMinDeadlineMs = 100;
constexpr std::uint32_t kMaxDeadlineMs = 120000;

#pragma pack(push, 1)
struct RequestHeader {
  char magic[8];
  std::uint32_t version;
  std::uint32_t operation;
  std::uint32_t flags;
  std::uint32_t parent_bytes;
  std::uint32_t name_bytes;
  std::uint32_t deadline_ms;
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
using RtlNtStatusToDosErrorFn = ULONG(NTAPI*)(NTSTATUS);

struct NativeApi {
  NtCreateFileFn create_file = nullptr;
  NtSetInformationFileFn set_information = nullptr;
  RtlNtStatusToDosErrorFn status_to_error = nullptr;
};

NativeApi LoadNativeApi() {
  HMODULE module = GetModuleHandleW(L"ntdll.dll");
  if (module == nullptr) return {};
  return {
    reinterpret_cast<NtCreateFileFn>(GetProcAddress(module, "NtCreateFile")),
    reinterpret_cast<NtSetInformationFileFn>(GetProcAddress(module, "NtSetInformationFile")),
    reinterpret_cast<RtlNtStatusToDosErrorFn>(GetProcAddress(module, "RtlNtStatusToDosError")),
  };
}

NativeApi g_native = LoadNativeApi();

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

std::string ParentWitnessMessage(const FileWitness& witness) {
  static constexpr char kHex[] = "0123456789abcdef";
  std::string message = "parent:";
  for (int shift = 60; shift >= 0; shift -= 4) message.push_back(kHex[(witness.volume >> shift) & 15]);
  message.push_back(':');
  for (std::uint8_t value : witness.file_id) {
    message.push_back(kHex[value >> 4]);
    message.push_back(kHex[value & 15]);
  }
  return message;
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

UniqueHandle OpenChild(HANDLE parent, const std::wstring& child_name, ChildDisposition disposition, ChildAccess child_access, std::uint32_t* error, bool* missing = nullptr) {
  if (!ValidChildName(child_name) || g_native.create_file == nullptr) {
    *error = ERROR_INVALID_NAME;
    return {};
  }
  UNICODE_STRING name = UnicodeView(child_name);
  OBJECT_ATTRIBUTES attributes = ObjectAttributes(&name, parent);
  IO_STATUS_BLOCK status_block{};
  HANDLE raw = INVALID_HANDLE_VALUE;
  ACCESS_MASK access = FILE_READ_ATTRIBUTES | SYNCHRONIZE;
  if (child_access == ChildAccess::Replace) access |= FILE_WRITE_ATTRIBUTES | DELETE;
  if (child_access == ChildAccess::WriteNew) access |= FILE_WRITE_DATA | FILE_WRITE_ATTRIBUTES | DELETE;
  NTSTATUS status = g_native.create_file(
    &raw,
    access,
    &attributes,
    &status_block,
    nullptr,
    FILE_ATTRIBUTE_NORMAL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    disposition == ChildDisposition::Create ? FILE_CREATE : FILE_OPEN,
    FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT | (child_access == ChildAccess::WriteNew ? FILE_WRITE_THROUGH : 0),
    nullptr,
    0);
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

struct LinkInformation {
  ULONG Flags;
  HANDLE RootDirectory;
  ULONG FileNameLength;
  WCHAR FileName[1];
};

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
  NTSTATUS status = g_native.set_information(file, &status_block, information, static_cast<ULONG>(buffer.size()), static_cast<FILE_INFORMATION_CLASS>(65));
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return false;
  }
  return true;
}

bool LinkRelative(HANDLE file, HANDLE parent, const std::wstring& name, std::uint32_t* error) {
  if (g_native.set_information == nullptr || !ValidChildName(name)) {
    *error = ERROR_INVALID_FUNCTION;
    return false;
  }
  auto buffer = NameInformation<LinkInformation>(name);
  auto* information = reinterpret_cast<LinkInformation*>(buffer.data());
  information->Flags = 0;
  information->RootDirectory = parent;
  IO_STATUS_BLOCK status_block{};
  NTSTATUS status = g_native.set_information(file, &status_block, information, static_cast<ULONG>(buffer.size()), static_cast<FILE_INFORMATION_CLASS>(72));
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return false;
  }
  return true;
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
  NTSTATUS status = g_native.set_information(file, &status_block, &information, sizeof(information), static_cast<FILE_INFORMATION_CLASS>(64));
  if (!NtSucceeded(status)) {
    *error = ErrorFromStatus(status);
    return false;
  }
  return true;
}

bool WritePayload(HANDLE input, HANDLE output_file, std::uint64_t max_bytes, ULONGLONG deadline, bool* cancelled, std::uint32_t* error) {
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
  if (!FlushFileBuffers(output_file)) {
    *error = GetLastError();
    return false;
  }
  return true;
}

int Run() {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (input == nullptr || input == INVALID_HANDLE_VALUE || output == nullptr || output == INVALID_HANDLE_VALUE || g_native.create_file == nullptr || g_native.set_information == nullptr || g_native.status_to_error == nullptr) return 111;

  RequestHeader request{};
  std::uint32_t error = ERROR_SUCCESS;
  ULONGLONG initial_deadline = GetTickCount64() + kMaxDeadlineMs;
  if (!ReadExactWithDeadline(input, &request, sizeof(request), initial_deadline, &error)) {
    SendResponse(output, kResponseError, error, {}, "The writer request header could not be read.");
    return 2;
  }
  if (std::memcmp(request.magic, kRequestMagic.data(), kRequestMagic.size()) != 0
      || request.version != kProtocolVersion
      || (request.operation != kOperationInspectParent && request.operation != kOperationInspectChild && request.operation != kOperationWrite)
      || (request.flags & ~kKnownFlags) != 0
      || request.parent_bytes == 0 || request.parent_bytes > kMaxParentBytes
      || request.name_bytes > kMaxNameBytes
      || request.deadline_ms < kMinDeadlineMs || request.deadline_ms > kMaxDeadlineMs
      || request.max_bytes > kMaxOutputBytes
      || (request.operation != kOperationInspectParent && request.name_bytes == 0)
      || ((request.flags & kFlagReplace) != 0 && (request.flags & kFlagExpectedChild) == 0)
      || ((request.flags & kFlagExpectedChild) != 0 && request.operation != kOperationWrite)) {
    SendResponse(output, kResponseError, ERROR_INVALID_DATA, {}, "The writer request is outside the fixed protocol contract.");
    return 3;
  }

  ULONGLONG deadline = GetTickCount64() + request.deadline_ms;
  std::string parent_utf8(request.parent_bytes, '\0');
  std::string name_utf8(request.name_bytes, '\0');
  if (!ReadExactWithDeadline(input, parent_utf8.data(), parent_utf8.size(), deadline, &error)
      || (!name_utf8.empty() && !ReadExactWithDeadline(input, name_utf8.data(), name_utf8.size(), deadline, &error))) {
    SendResponse(output, kResponseError, error, {}, "The writer request names could not be read.");
    return 4;
  }
  std::wstring parent_path = Utf8ToWide(parent_utf8);
  std::wstring child_name = name_utf8.empty() ? std::wstring{} : Utf8ToWide(name_utf8);
  if (parent_path.empty() || (!name_utf8.empty() && !ValidChildName(child_name))) {
    SendResponse(output, kResponseError, ERROR_INVALID_NAME, {}, "The writer accepts one absolute parent and one validated basename.");
    return 5;
  }

  bool writable = request.operation == kOperationWrite;
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
  if (!ReadExactWithDeadline(input, &action, sizeof(action), deadline, &error)) {
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

  std::wstring temporary_name = RandomChildName(L".tmp", &error);
  if (temporary_name.empty()) {
    SendResponse(output, kResponseError, error, parent_witness, "A bounded temporary basename could not be generated.");
    return 15;
  }
  UniqueHandle temporary = OpenChild(parent.get(), temporary_name, ChildDisposition::Create, ChildAccess::WriteNew, &error);
  if (!temporary) {
    SendResponse(output, kResponseError, error, parent_witness, "The temporary child could not be created relative to the approved parent.");
    return 16;
  }
  bool temporary_named = true;
  auto cleanup_temporary = [&]() {
    if (temporary_named && temporary) {
      std::uint32_t ignored = ERROR_SUCCESS;
      DeleteHandle(temporary.get(), &ignored);
    }
  };
  bool cancelled = false;
  if (!WritePayload(input, temporary.get(), request.max_bytes, deadline, &cancelled, &error)) {
    cleanup_temporary();
    SendResponse(output, cancelled ? kResponseCancelled : kResponseError, cancelled ? ERROR_CANCELLED : error, parent_witness, cancelled ? "The write was cancelled and its temporary child was removed." : "The bounded output stream could not be written and flushed.");
    return cancelled ? 0 : 17;
  }

  std::wstring backup_name;
  bool backup_named = false;
  if ((request.flags & kFlagReplace) != 0) {
    backup_name = RandomChildName(L".backup", &error);
    if (backup_name.empty() || !LinkRelative(child.get(), parent.get(), backup_name, &error)) {
      cleanup_temporary();
      SendResponse(output, kResponseError, error, child_witness, "The authorized destination rollback link could not be created.");
      return 18;
    }
    backup_named = true;
  }

  bool replaced = (request.flags & kFlagReplace) != 0;
  if (!RenameRelative(temporary.get(), parent.get(), child_name, replaced, &error)) {
    cleanup_temporary();
    if (backup_named) {
      bool missing = false;
      UniqueHandle backup = OpenChild(parent.get(), backup_name, ChildDisposition::Open, ChildAccess::Replace, &error, &missing);
      if (backup) DeleteHandle(backup.get(), &error);
    }
    SendResponse(output, kResponseError, error, child_witness, "Atomic destination promotion was refused.");
    return 19;
  }
  temporary_named = false;

  FileWitness promoted_witness{};
  bool promotion_ok = FlushFileBuffers(temporary.get()) && QueryWitness(temporary.get(), &promoted_witness, &error);
#if defined(MDCW_TEST_FAULTS)
  if ((request.flags & kFlagTestRollback) != 0) promotion_ok = false;
#endif
  if (!promotion_ok) {
    std::uint32_t rollback_error = error == ERROR_SUCCESS ? ERROR_WRITE_FAULT : error;
    if (backup_named) {
      bool missing = false;
      UniqueHandle backup = OpenChild(parent.get(), backup_name, ChildDisposition::Open, ChildAccess::Replace, &rollback_error, &missing);
      if (backup && RenameRelative(backup.get(), parent.get(), child_name, true, &rollback_error) && FlushFileBuffers(backup.get())) {
        backup_named = false;
      }
    }
    SendResponse(output, kResponseError, rollback_error, child_witness, "The promoted file could not be flushed, so the authorized original was restored.");
    return 20;
  }

  if (backup_named) {
    bool missing = false;
    UniqueHandle backup = OpenChild(parent.get(), backup_name, ChildDisposition::Open, ChildAccess::Replace, &error, &missing);
    if (!backup || !DeleteHandle(backup.get(), &error)) {
      if (backup && RenameRelative(backup.get(), parent.get(), child_name, true, &error) && FlushFileBuffers(backup.get())) {
        backup_named = false;
        SendResponse(output, kResponseError, error, child_witness, "Rollback-link cleanup failed, so the authorized original was restored.");
        return 21;
      }
      SendResponse(output, kResponseError, error, promoted_witness, "The output was promoted, but its rollback link could not be removed or restored.");
      return 21;
    }
  }
  SendResponse(output, kResponseResult, 1, promoted_witness);
  return 0;
}

}  // namespace

int wmain() {
  return Run();
}
