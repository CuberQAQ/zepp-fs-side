/**
 * Open Source Module @cuberqaq/fs-side
 * @description Simple Lib for ZeppOS 1.0/2.0/2.1 app-side to build a vitual file system.
 * @author CuberQAQ <a224503353@163.com>
 * @license Apache-2.0
 * Repo: https://github.com/CuberQAQ/zepp-fs-side
 */
import * as path from "@cuberqaq/path-polyfill";
// Operation Flags
export const O_RDONLY = 0x01;
export const O_WRONLY = 0x02;
export const O_RDWR = 0x04;
export const O_APPEND = 0x08;
export const O_CREAT = 0x10;
export const O_EXCL = 0x20;
export const O_TRUNC = 0x30;

export function _getKey(type, subKey) {
  return "CBFS$" + type + ":" + subKey;
}
const DEBUG = false;
var _file_handle_map = new Map();

const _getItem = (key) => settings.settingsStorage.getItem(key);
const _setItem = (key, value) => settings.settingsStorage.setItem(key, value);
const _removeItem = (key) => settings.settingsStorage.removeItem(key);

export function _parseFileHandle(handle) {
  if (typeof handle !== "number") return;
  if (!_file_handle_map.has(handle)) return;
  let basic_info = _file_handle_map.get(handle);
  return { ...basic_info, fileObj: _getFileObj(basic_info.path) };
}

export function _getNewFileHandle(path, flags) {
  if (typeof flags === "undefined") flags = O_RDONLY;
  if (typeof flags !== "number") return;
  let fileObj = _getFileObj(path);
  if (typeof fileObj === "undefined") {
    if (!(flags & O_CREAT)) return;
    else fileObj = _createFile(path);
    if (typeof fileObj === "undefined") return;
  } else if (flags & O_CREAT && flags & O_EXCL) return;
  let handle = (new Date().getTime() + 114514) % 1919810;
  while (_file_handle_map.has(handle)) ++handle;
  _file_handle_map.set(handle, { path, flags });
  return handle;
}

export function _checkIfInited() {
  return typeof _getItem(_getKey("config", "head")) !== "undefined";
}

export function _initFileSystem() {
  // Already inited
  if (_checkIfInited()) return;
  console.log("CBFS", "Init CBFS FileSystem for app-side");
  let head = {
    root: "/",
    nextFileBlockId: 1,
  };

  let data_dir = _buildDirObj({ path: "/data", files: [], dirs: [] });
  let assets_dir = _buildDirObj({ path: "/assets", files: [], dirs: [] });
  let root_dir = _buildDirObj({
    path: "/",
    files: [],
    dirs: ["data", "assets"],
  });
  _setItem(_getKey("config", "head"), JSON.stringify(head));
  _setItem(_getKey("dir", "/"), JSON.stringify(root_dir));
  _setItem(_getKey("dir", "/data"), JSON.stringify(data_dir));
  _setItem(_getKey("dir", "/assets"), JSON.stringify(assets_dir));
}

export function _resetFileSystem() {
  if (!_checkIfInited()) return false;
  let deletedFileCount = 0,
    deletedDirCount = 0;
  // DFS
  let head = JSON.parse(_getItem(_getKey("config", "head")));
  let rootDirObj = _getDirObj(head.root);
  if (typeof head === "undefined" || typeof rootDirObj === "undefined")
    return false;
  let quene = [rootDirObj];
  while (quene.length > 0) {
    let dirObj = quene.splice(0, 1)[0];
    // Delete Files
    for (let fileObj of dirObj.files) {
      _free(fileObj.block);
      ++deletedFileCount;
    }
    // Enquene Children Dirs
    for (let childDirname of dirObj.dirs) {
      let childDirObj = _getDirObj(childDirname);
      if (typeof childDirObj !== "undefined") quene.push(childDirObj);
    }
    // Delete Dir Obj
    _removeItem(_getKey("dir", dirObj.path));
    ++deletedDirCount;
  }
  // Delete Head
  _removeItem(_getKey("config", "head"));
  return { deletedDirCount, deletedFileCount };
}

export function _getDirObj(pathLike) {
  if (typeof pathLike !== "string") return;
  if (!_checkIfInited) _initFileSystem();
  let { root } = JSON.parse(_getItem(_getKey("config", "head")));
  let target_path = path.join(root, path.normalize(pathLike));
  if (target_path != "/" && target_path.endsWith("/"))
    target_path = target_path.slice(0, target_path.length - 1);
  let dirObj = _getItem(_getKey("dir", target_path));
  if (dirObj) return JSON.parse(dirObj);
}

export function _getFileObj(pathLike) {
  if (typeof pathLike !== "string" || pathLike.endsWith("/")) return;
  let pathObj = path.parse(path.join("/", pathLike));
  let dir = _getDirObj(pathObj.dir);
  if (typeof dir === "undefined") return;
  for (let obj of dir.files) if (obj.name === pathObj.base) return obj;
}

function _alloc() {
  let head = JSON.parse(_getItem(_getKey("config", "head")));
  let blockID = head.nextFileBlockId++;
  _setItem(_getKey("block", blockID), "");
  _setItem(_getKey("config", "head"), JSON.stringify(head));
  return blockID;
}

function _free(block_index) {
  return _removeItem(_getKey("block", block_index));
}

function _buildFileObj({ name, path, size, utc, block }) {
  return {
    name,
    path,
    size,
    utc,
    block,
  };
}

function _buildDirObj({ path, files, dirs }) {
  return {
    path,
    files,
    dirs,
  };
}

/**
 * 非官方错误码
 */
export const _ErrorCode = {
  ARG_TYPE_ERROR: 0x01,
  OPERATION_FAILURE: 0x02,
  DIR_NOT_EXIST: 0x03,
  FILE_NOT_EXIST: 0x04,
  INVALID_HANDLE: 0x05,
  ALREADY_EXIST: 0x06,
};

export function _mkdir(pathLike) {
  if (typeof pathLike !== "string") return;
  let pathObj = path.parse(path.join("/", pathLike));
  let parentDirObj = _getDirObj(pathObj.dir);
  if (typeof parentDirObj === "undefined" || parentDirObj.path === pathObj.root)
    return;
  for (let dir of parentDirObj.dirs) if (dir === pathObj.base) return;
  for (let file of parentDirObj.dirs) if (file.name === pathObj.base) return;
  let dirObj = _buildDirObj({
    path: path.join(pathObj.dir, pathObj.base),
    dirs: [],
    files: [],
  });
  parentDirObj.dirs.push(pathObj.base);
  _setItem(
    _getKey("dir", path.join(pathObj.dir, pathObj.base)),
    JSON.stringify(dirObj)
  );
  return dirObj;
}

export function _moveFile(oldPathLike, newPathLike) {
  if (typeof oldPathLike !== "string" || typeof newPathLike !== "string")
    return;
  let fileObj = _getFileObj(oldPathLike);
  if (typeof fileObj === "undefined" || _getFileObj(newPathLike)) return;
  let oldParentObj = _getDirObj(fileObj.path);
  let newParentObj = newPathLike.endsWith("/")
    ? _getDirObj(newPathLike)
    : _getDirObj(path.parse(newPathLike).dir);
  if (typeof newParentObj === "undefined") return;
  if (
    newPathLike.endsWith("/") &&
    _getFileObj(path.join(newPathLike, fileObj.name))
  )
    return;
  if (oldParentObj.path != newParentObj.path) {
    let oldFileIndex = 0,
      len = oldParentObj.files.length;
    while (
      oldFileIndex < len &&
      oldParentObj.files[oldFileIndex].name !== fileObj.name
    )
      ++oldFileIndex;
    if (oldFileIndex == len) return;
    oldParentObj.files.splice(oldFileIndex, 1);
  } else {
    let oldFileIndex = 0,
      len = newParentObj.files.length;
    while (
      oldFileIndex < len &&
      newParentObj.files[oldFileIndex].name !== fileObj.name
    )
      ++oldFileIndex;
    if (oldFileIndex == len) return;
    newParentObj.files.splice(oldFileIndex, 1);
  }
  if (!newPathLike.endsWith("/")) fileObj.name = path.parse(newPathLike).base;
  fileObj.path = newPathLike.path;
  newParentObj.files.push(fileObj);
  _setItem(_getKey("dir", oldParentObj.path), JSON.stringify(oldParentObj));
  _setItem(_getKey("dir", newParentObj.path), JSON.stringify(newParentObj));
  return 0;
}

export function _readFile(
  fileObj,
  buf,
  { offset = 0, length = Number.MAX_SAFE_INTEGER, position = 0 } = {}
) {
  if (
    typeof fileObj === "undefined" ||
    typeof fileObj.block !== "number" ||
    typeof fileObj.size !== "number"
  )
    return;
  if(typeof buf === 'undefined') buf = new ArrayBuffer(fileObj.size)
  if (!(buf instanceof ArrayBuffer)) return;
  let raw_str = _getItem(_getKey("block", fileObj.block));
  DEBUG && console.warn("raw_str", raw_str);
  if (typeof raw_str !== "string") return;
  if (typeof buf === "undefined") buf = new ArrayBuffer(fileObj.size);
  let bufView = new Uint8Array(buf);
  length = length <= raw_str.length - position ? length : raw_str.length;
  if (length > bufView.byteLength - offset) length = bufView.length - offset;
  DEBUG && console.warn("length", length);
  for (let i = 0; i < length; ++i)
    bufView[i + offset] = raw_str.charCodeAt(i + position);
  return { buf, length };
}
export function _removeFile(pathLike) {
  let fileObj = _getFileObj(pathLike);
  if (typeof fileObj === "undefined") return;
  let parentDirObj = _getDirObj(fileObj.path);
  let i = 0,
    len = parentDirObj.files.length;
  while (i < len && parentDirObj.files[i].name !== fileObj.name) ++i;
  if (i == len) return;
  parentDirObj.files.splice(i, 1);
  _setItem(_getKey("dir", parentDirObj.path), JSON.stringify(parentDirObj));
  _free(fileObj.block);
  return 0;
}

export function _writeFile(
  fileObj,
  bin,
  { offset = 0, length = Number.MAX_SAFE_INTEGER, position = 0 }
) {
  if (typeof fileObj === "undefined") return;
  let buf = null;
  if (bin instanceof Buffer) buf = bin.buffer;
  else if (bin instanceof ArrayBuffer) buf = bin;
  else if (ArrayBuffer.isView(bin)) buf = bin.buffer;
  else return;
  if (length > buf.byteLength - offset) length = buf.byteLength - offset;
  if (position != 0) {
    let raw = _getItem(_getKey("block", fileObj.block));
    if (typeof raw === "undefined") raw = "";
    let len = raw.length;
    if (len < position + length) len = position + length;
    let temp_buf = new ArrayBuffer(len);
    let temp_buf_view = new Uint8Array(temp_buf);
    for (let i = 0, l = raw.length; i < l; ++i)
      temp_buf_view[i] = raw.charCodeAt(i);
    let bufView = new Uint8Array(buf);
    for (let i = 0; i < len; ++i)
      temp_buf_view[position + i] = bufView[offset + i];
    buf = temp_buf;
  }
  fileObj.size = buf.byteLength;
  fileObj.utc = new Date().getTime();
  let parentDirObj = _getDirObj(fileObj.path);
  let i = 0,
    len = parentDirObj.files.length;
  while (i < len && parentDirObj.files[i].name !== fileObj.name) ++i;
  if (i == len) return; /* Can not find fileObj in Parent Dir Obj */
  parentDirObj.files[i] = fileObj;
  _setItem(_getKey("dir", parentDirObj.path), JSON.stringify(parentDirObj));
  _setItem(
    _getKey("block", fileObj.block),
    Buffer.from(buf).toString("binary")
  );
  return { length }; /* Success */
}

export function _createFile(pathLike) {
  if (typeof pathLike !== "string") return;
  if (pathLike.endsWith("/")) return;
  let pathObj = path.parse(path.join("/", pathLike));
  let parentDirObj = _getDirObj(pathObj.dir);
  if (typeof parentDirObj === "undefined") return;
  for (let file of parentDirObj.files)
    if (file.name === pathLike.base) return; /* already exist */
  for (let dirname of parentDirObj.dirs)
    if (dirname === pathLike.base) return; /* same name as exist dir */
  let blockId = _alloc();
  let fileObj = _buildFileObj({
    name: pathObj.base,
    path: pathObj.dir,
    size: 0,
    utc: new Date().getTime(),
    block: blockId,
  });
  parentDirObj.files.push(fileObj);
  _setItem(_getKey("dir", parentDirObj.path), JSON.stringify(parentDirObj));
  return fileObj;
}

export function openSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.path === "undefined" ||
    typeof option.path !== "string"
  )
    throw new Error("[CBFS] Arg Type Error");
  if (typeof option.flag === "undefined") option.flag = O_RDONLY;
  if (typeof option.flag !== "number") throw new Error("[CBFS] Arg Type Error");
  if (!_checkIfInited()) _initFileSystem();
  let handle = _getNewFileHandle(path.join("/data", option.path), option.flag);
  if (typeof handle === "undefined") throw new Error("[CBFS] Operation Error");
  return handle;
}

export function openAssetsSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.path === "undefined" ||
    typeof option.path !== "string"
  )
    throw new Error("[CBFS] Arg Type Error");
  if (typeof option.flag === "undefined") option.flag = O_RDONLY;
  else if (typeof option.flag !== "number")
    throw new Error("[CBFS] Arg Type Error");
  if (!_checkIfInited()) _initFileSystem();
  let handle = _getNewFileHandle(
    path.join("/assets", option.path),
    option.flag
  );
  if (typeof handle === "undefined") throw new Error("[CBFS] Operation Error");
  return handle;
}

export function statSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.path === "undefined" ||
    typeof option.path !== "string"
  )
    return;
  let fileObj = _getFileObj(path.join("/data/", option.path));
  if (typeof fileObj === "undefined") return;
  return {
    size: fileObj.size,
    mtimeMs: fileObj.utc,
  };
}

export function statAssetsSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.path === "undefined" ||
    typeof option.path !== "string"
  )
    return;
  let fileObj = _getFileObj(path.join("/assets/", option.path));
  if (typeof fileObj === "undefined") return;
  return {
    size: fileObj.size,
    mtimeMs: fileObj.utc,
  };
}

export function closeSync(option_or_fd) {
  let handle = null;
  if (typeof option_or_fd === "undefined") return _ErrorCode.ARG_TYPE_ERROR;
  handle = typeof option_or_fd === "number" ? option_or_fd : option_or_fd.fd;
  if (typeof handle === "undefined") return _ErrorCode.ARG_TYPE_ERROR;
  if (!_file_handle_map.has(handle)) return _ErrorCode.INVALID_HANDLE;
  _file_handle_map.delete(handle);
  return 0; /* Success */
}

export function readFileSync(option) {
  if (typeof option === "undefined" || typeof option.path !== "string") return; // Error
  if (typeof option.options !== "undefined") {
    if (option.options.encoding && typeof option.options.encoding !== "string")
      return;
  }
  let fileObj = _getFileObj(path.join("/data", option.path));
  if (typeof fileObj === "undefined") return;
  let { buf } = _readFile(fileObj);
  if (option.options.encoding)
    return Buffer.from(buf).toString(option.options.encoding);
  else return buf;
}

export function readSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.fd !== "number" ||
    option.buffer instanceof ArrayBuffer == false
  )
    return; // Error
  if (typeof option.options !== "undefined") {
    if (option.options.offset && typeof option.options.offset !== "number")
      return;
    if (option.options.length && typeof option.options.length !== "number")
      return;
    if (option.options.position && typeof option.options.position !== "number")
      return;
  }
  let handle_info = _parseFileHandle(option.fd);
  DEBUG &&
    console.warn(
      "handle_info",
      handle_info,
      "buf length",
      option.buffer?.byteLength
    );
  if (typeof handle_info === "undefined") return;
  let res = _readFile(handle_info.fileObj, option.buffer, {
    ...option.options,
  });
  if (typeof res === "undefined") return;
  return res.length;
}

export function writeSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.fd !== "number" ||
    option.buffer instanceof ArrayBuffer == false
  )
    return; // Error
  if (typeof option.options !== "undefined") {
    if (option.options.offset && typeof option.options.offset !== "number")
      return;
    if (option.options.length && typeof option.options.length !== "number")
      return;
    if (option.options.position && typeof option.options.position !== "number")
      return;
  }
  let handle_info = _parseFileHandle(option.fd);
  if (typeof handle_info === "undefined") return;
  let res = _writeFile(handle_info.fileObj, option.buffer, {
    ...option.options,
  });
  if (typeof res === "undefined") return;
  return res.length;
}

export function writeFileSync(option) {
  if (
    typeof option === "undefined" ||
    (typeof option.path !== "string" && typeof option.path !== "number") ||
    (typeof option.data !== "string" &&
      !ArrayBuffer.isView(option.data) &&
      !(option.data instanceof ArrayBuffer))
  )
    return; // Error
  if (typeof option.options !== "undefined") {
    if (option.options.encoding && typeof option.options.encoding !== "string")
      return; //Error
  }

  let fileObj = null;
  if (typeof option.path === "string")
    fileObj = _getFileObj(path.join("/data", option.path));
  else fileObj = _parseFileHandle(option.path).fileObj;
  if (typeof fileObj === "undefined") return;
  _writeFile(
    fileObj,
    typeof option.data === "string"
      ? Buffer.from(option.data, option.options.encoding)
      : option.data,
    {}
  );
}

export function rmSync(option_or_path) {
  if (typeof option_or_path === "undefined") return _ErrorCode.ARG_TYPE_ERROR;
  let res = 0;
  if (typeof option_or_path === "string")
    res = _removeFile(path.join("/data", option_or_path));
  else res = _removeFile(option_or_path.path);
  if (typeof res === "undefined") return _ErrorCode.OPERATION_FAILURE;
  return 0;
}

export function renameSync(option) {
  if (
    typeof option === "undefined" ||
    typeof option.oldPath !== "string" ||
    typeof option.newPath !== "string"
  )
    return _ErrorCode.ARG_TYPE_ERROR;
  if (option.oldPath.endsWith("/") || option.newPath.endsWith("/"))
    return _ErrorCode.ARG_TYPE_ERROR;
  let res = _moveFile(
    path.join("/data/", option.oldPath),
    path.join("/data/", option.newPath)
  );
  if (typeof res === "undefined") return _ErrorCode.OPERATION_FAILURE;
  return 0; /* Success */
}

export function mkdirSync(option_or_path) {
  if (typeof option_or_path === "undefined") return _ErrorCode.ARG_TYPE_ERROR;
  let pathLike =
    typeof option_or_path === "string" ? option_or_path : option_or_path.path;
  if (typeof pathLike !== "string") return _ErrorCode.ARG_TYPE_ERROR;
  let dirObj = _mkdir(pathLike);
  if (typeof dirObj === "undefined") return _ErrorCode.OPERATION_FAILURE;
  return 0; /* Success */
}

export function readdirSync(option) {
  if (typeof option === "undefined" || typeof option.path !== "string") return; // Error
  let dirObj = _getDirObj(option.path);
  if (typeof dirObj === "undefined") return;
  let filenameList = [];
  for (let fileObj of dirObj.files) filenameList.push(fileObj.name);
  return dirObj.dirs.concat(filenameList);
}

export default {
  O_APPEND,
  O_CREAT,
  O_EXCL,
  O_RDONLY,
  O_RDWR,
  O_TRUNC,
  O_WRONLY,
  openSync,
  openAssetsSync,
  statSync,
  statAssetsSync,
  closeSync,
  readSync,
  readFileSync,
  writeSync,
  writeFileSync,
  rmSync,
  renameSync,
  mkdirSync,
  readdirSync,
  _getKey,
  _getNewFileHandle,
  _parseFileHandle,
  _checkIfInited,
  _initFileSystem,
  _resetFileSystem,
  _getDirObj,
  _getFileObj,
  _ErrorCode,
  _mkdir,
  _moveFile,
  _readFile,
  _removeFile,
  _writeFile,
  _createFile,
};
