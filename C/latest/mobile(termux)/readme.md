# Quiz Game (C) – Termux Setup & Run Guide
RUN   ./quiz_game 
in termux
## 📱 Overview

This quiz game runs on Android using the Termux app.
It fetches questions from an API using **libcurl** and parses JSON using **cJSON**.

---

## ⚙️ Step 1: Update Termux

```bash
pkg update && pkg upgrade -y
```

---

## 📦 Step 2: Install Required Packages

```bash
pkg install clang curl git -y
```

---

## 📁 Step 3: Get Project Files

### Option A: Clone from Git

```bash
git clone <your-repo-link>
cd <repo-folder>/C
```

### Option B: Copy from phone storage

```bash
termux-setup-storage
cp -r /storage/emulated/0/Download/C ~/
cd ~/C
```

⚠️ Always work inside `~/` (Termux home), NOT `/storage/...`

---

## 📥 Step 4: Add cJSON Files

Download required files:

```bash
curl -O https://raw.githubusercontent.com/DaveGamble/cJSON/master/cJSON.c
curl -O https://raw.githubusercontent.com/DaveGamble/cJSON/master/cJSON.h
```

---

## 🛠️ Step 5: Compile

```bash
clang quiz_game5.c cJSON.c -o quiz_game -lcurl
```

---

## ▶️ Step 6: Run

```bash
./quiz_game
```

---

## ⚠️ Important Notes

* Do **NOT** run from `/storage/emulated/0/...` → execution is blocked.
* Always compile and run inside:

  ```bash
  ~ (home directory)
  ```
* Internet connection is required (for fetching quiz questions).
* Precompiled binaries will **NOT work** → always recompile in Termux.

---

## 🐞 Troubleshooting

### 1. `Permission denied`

✔ Fix:

* Move project to home:

  ```bash
  cp -r /storage/emulated/0/Download/C ~/
  cd ~/C
  ```
* Recompile and run again

---

### 2. `cJSON.h not found`

✔ Fix:

```bash
curl -O https://raw.githubusercontent.com/DaveGamble/cJSON/master/cJSON.h
```

---

### 3. Curl / API errors

✔ Check internet:

```bash
ping google.com
```

---

## ✅ Done

You can now successfully compile and run the quiz game in Termux 🎉
