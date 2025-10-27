<?php
// upload_profile.php - secure profile picture upload
session_start();

if (!isset($_SESSION['user_id'])) {
    header('Location: login2.html');
    exit;
}

// DB connection (XAMPP local)
require_once __DIR__ . '/config.php';
$con = db_connect();

if (!$con) {
    error_log("DB connect error: " . mysqli_connect_error());
    die("Database connection error.");
}

// Check file
if (!isset($_FILES['profile_pic']) || $_FILES['profile_pic']['error'] === UPLOAD_ERR_NO_FILE) {
    header('Location: welcome.php?msg=' . urlencode('No file selected.'));
    exit;
}

$file = $_FILES['profile_pic'];

// basic upload errors
if ($file['error'] !== UPLOAD_ERR_OK) {
    header('Location: welcome.php?msg=' . urlencode('Upload error. Code: ' . $file['error']));
    exit;
}

// Validate file size (2 MB max)
$maxBytes = 2 * 1024 * 1024;
if ($file['size'] > $maxBytes) {
    header('Location: welcome.php?msg=' . urlencode('File too large. Max 2 MB.'));
    exit;
}

// Validate MIME type (use finfo)
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);

$allowed = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp'
];

if (!array_key_exists($mime, $allowed)) {
    header('Location: welcome.php?msg=' . urlencode('Invalid file type. Use JPG, PNG or WebP.'));
    exit;
}

// Build a safe unique filename
$ext = $allowed[$mime];
$user_id = intval($_SESSION['user_id']);
$filename = 'user_' . $user_id . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
require_once __DIR__ . '/config.php';
$target_dir = $UPLOAD_DIR; // defined in config.php
$thumb_dir  = $THUMB_DIR;
$target_path = $target_dir . $filename;

// Ensure uploads directory exists
if (!is_dir($target_dir)) {
    if (!mkdir($target_dir, 0755, true)) {
        error_log("Could not create uploads dir");
        header('Location: welcome.php?msg=' . urlencode('Server error (mkdir).'));
        exit;
    }
}

// Move uploaded file
if (!move_uploaded_file($file['tmp_name'], $target_path)) {
    error_log("Failed to move uploaded file");
    header('Location: welcome.php?msg=' . urlencode('Failed to save file.'));
    exit;
}

// OPTIONAL: Resize or sanitize image here if you want (not included)

// Save filename into DB (profile_pic column)
$stmt = mysqli_prepare($con, "UPDATEusers0SET profile_pic = ? WHERE id = ?");
if (!$stmt) {
    error_log("Prepare failed: " . mysqli_error($con));
    header('Location: welcome.php?msg=' . urlencode('Database error.'));
    exit;
}
mysqli_stmt_bind_param($stmt, "si", $filename, $user_id);
if (!mysqli_stmt_execute($stmt)) {
    error_log("Execute failed: " . mysqli_stmt_error($stmt));
    mysqli_stmt_close($stmt);
    header('Location: welcome.php?msg=' . urlencode('Database error.'));
    exit;
}
mysqli_stmt_close($stmt);

// Optionally delete old profile pic file(s) — implement if desired

mysqli_close($con);

// Redirect back to dashboard
header('Location: welcome.php?msg=' . urlencode('Profile picture updated.'));
exit;
