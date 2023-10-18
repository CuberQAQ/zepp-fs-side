# fs-side

Simple Lib for ZeppOS 1.0/2.0/2.1 app-side to build a vitual file system.

It use settings storage api to storage data, not a true file system, so don't save many big files. Welcome to send issues and PR to make this project better!
Some api were not tested. I don't know whether it could work correctly.

## 1. Install

Use Command `npm i @cuberqaq/fs-side --save` to install fs-side in your ZeppOS Miniapp project.

## 2. Import & Use

In your app-side JavaScript source file, use this to import fs-side:

```js
import * as fs from "@cuberqaq/fs-side";
```

Then you can use the methods in the same way you do with @zos/fs module. API Document see [Zepp OS Developers Documentation](https://docs.zepp.com/docs/reference/device-app-api/newAPI/fs/closeSync/)
For example:

```js
import fs from ".";
fs.writeFileSync({
  path: "test.txt",
  data: "hello world!",
  options: {
    encoding: "utf8",
  },
});
```
