# Quiz Game (C) – Setup & Run Guide on Ubuntu or Termux(android)

## 📌 Overview

This is a terminal-based quiz game written in C.
It fetches questions from an API using **libcurl** and parses JSON using **cJSON**.

---

## ⚙️ Requirements

Make sure you are using **Ubuntu / WSL (x86_64)**.

Install dependencies:

```bash
sudo apt update
sudo apt install build-essential libcurl4-openssl-dev libcjson-dev
```

---

## 🛠️ Compilation

Since the project uses `cJSON`, include its header path during compilation:

```bash
gcc quiz_game5.c -o quiz_game -lcurl -lcjson -I/usr/include/cjson
```

---

## ▶️ Running the Program

```bash
./quiz_game
```

---

## ⚠️ Notes

* Do **NOT** use precompiled binaries (`run`, `program`, etc.) → they are ARM (Android) and won’t work on WSL.
* Ensure you have **internet access** (required for fetching quiz questions).
* If needed, modify:

  ```c
  #include "cJSON.h"
  ```

  to:

  ```c
  #include <cjson/cJSON.h>
  ```

---

## 🐞 Troubleshooting

### 1. `cJSON.h: No such file or directory`

Fix:

```bash
gcc quiz_game5.c -o quiz_game -lcurl -lcjson -I/usr/include/cjson
```

---

### 2. Curl/API errors

Check internet:

```bash
ping google.com
```

---

### 3. Permission issues

```bash
chmod +x quiz_game
```

---

## 📱 Android (Termux Support)

This project also works on Android using the Termux app.

---

### ⚙️ Setup in Termux

Install required packages:

```bash
pkg update
pkg upgrade
pkg install clang curl
```

---

### 🛠️ Compilation in Termux

```bash
clang quiz_game5.c -o quiz_game -lcurl
```

---

### ▶️ Run in Termux

```bash
./quiz_game
```

---

### ⚠️ Notes (Termux)

* No need to install `cJSON` separately if your project already includes it internally or uses system headers.
* Ensure internet is enabled (mobile data/WiFi).
* If `cJSON.h` error appears, either:

  * Add header manually, or
  * Use same include fix:

    ```bash
    clang quiz_game5.c -o quiz_game -lcurl -I/usr/include/cjson
    ```

---

## ✅ Done

You can now compile and run the quiz game on:

* 💻 Ubuntu / WSL
* 📱 Android (Termux)

Enjoy 🚀
