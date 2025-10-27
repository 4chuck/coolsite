<?php
// log.php - login handler (fixed & improved)
session_start();

// Local XAMPP DB credentials
require_once __DIR__ . '/config.php';
$con = db_connect();

if (!$con) {
    error_log("DB connect error: " . mysqli_connect_error());
    // For debugging you can echo a friendly message, but avoid exposing credentials/errors in production
    die("ERROR: Could not connect to the database.");
}

// Read POST values (email, pass)
$email = isset($_POST['email']) ? trim($_POST['email']) : '';
$password = isset($_POST['pass']) ? $_POST['pass'] : '';

if ($email === '' || $password === '') {
    echo "<h1>Please provide email and password.</h1>";
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo "<h1>Invalid email format.</h1>";
    exit;
}

// Prepare statement to fetch user by email
$stmt = mysqli_prepare($con, "SELECT id, username, password, email FROMusers0WHERE email = ?");
if (!$stmt) {
    error_log("Prepare failed: " . mysqli_error($con));
    die("Database error.");
}

mysqli_stmt_bind_param($stmt, "s", $email);

if (!mysqli_stmt_execute($stmt)) {
    error_log("Execute failed: " . mysqli_stmt_error($stmt));
    mysqli_stmt_close($stmt);
    die("Database error.");
}

// Bind result variables
mysqli_stmt_store_result($stmt);
if (mysqli_stmt_num_rows($stmt) === 0) {
    // no user with that email
    mysqli_stmt_close($stmt);
    echo "<h1>Login failed. Invalid email or password.</h1>";
    mysqli_close($con);
    exit;
}

mysqli_stmt_bind_result($stmt, $id, $username, $hashed_password, $email_db);
$fetch_ok = mysqli_stmt_fetch($stmt);
mysqli_stmt_close($stmt);

if ($fetch_ok) {
    // Verify password hash
    if (password_verify($password, $hashed_password)) {
        // Login OK — create session
        session_regenerate_id(true);
        $_SESSION['user_id'] = $id;
        $_SESSION['username'] = $username;
        $_SESSION['email'] = $email_db;

        // Redirect to protected page (change if you want)
        header('Location: https://4chuck.github.io/coolsite/index0.html');
        exit;
    } else {
        echo "<h1>Login failed. Invalid email or password.</h1>";
    }
} else {
    // fetch failed for some reason
    error_log("Fetch failed for email: $email");
    echo "<h1>Login failed. Invalid email or password.</h1>";
}

mysqli_close($con);
?>
