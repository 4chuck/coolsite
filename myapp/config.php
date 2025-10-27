<?php
// config.php - update with your InfinityFree values after creating the database
// IMPORTANT: do not commit live credentials to public repos

// Replace these values with the ones from your InfinityFree control panel
$DB_HOST = 'sql109.infinityfree.com';   // example — get exact host from control panel
$DB_USER = 'if0_37076679';              // your DB username (InfinityFree style)
$DB_PASS = 'mF0fHKPoCWjY';          // your DB password (set when you create DB)
$DB_NAME = 'if0_37076679_users';        // database name you created

// Upload directories (server paths)
$UPLOAD_DIR = __DIR__ . '/uploads/';    // absolute path on server
$THUMB_DIR  = $UPLOAD_DIR . 'thumbs/';  // thumbnails

// URL path (used for building links to uploaded images). If app in web root, this is '/uploads/'
$UPLOAD_URL = '/uploads/';              // change if your app is inside a subfolder

// Utility: open a DB connection (mysqli)
function db_connect() {
    global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME;
    $con = mysqli_connect($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    if (!$con) {
        error_log("DB connect error: " . mysqli_connect_error());
        // friendly message to user
        die("Database connection failed. Please contact administrator.");
    }
    // set charset
    mysqli_set_charset($con, "utf8mb4");
    return $con;
}
?>
