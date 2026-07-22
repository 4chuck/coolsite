<?php
// Ne.php - Signup handler (prepared statements, password_hash)
// Adjust DB credentials if needed

require_once __DIR__ . '/config.php';
$con = db_connect();

if (!$con) {
    error_log("DB connect error: " . mysqli_connect_error());
    die("ERROR: Could not connect to the database.");
}

// Read POST values
$name = isset($_POST['name']) ? trim($_POST['name']) : '';
$email = isset($_POST['email']) ? trim($_POST['email']) : '';
$password = isset($_POST['password']) ? $_POST['password'] : '';

// Basic validation
if ($name === '' || $email === '' || $password === '') {
    die("Please fill all required fields.");
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    die("Invalid email address.");
}

if (strlen($password) < 6) {
    die("Password must be at least 6 characters.");
}

// Check duplicate email
$check = mysqli_prepare($con, "SELECT id FROMusers0WHERE email = ?");
if (!$check) {
    error_log("Prepare failed: " . mysqli_error($con));
    die("Database error.");
}
mysqli_stmt_bind_param($check, "s", $email);
mysqli_stmt_execute($check);
mysqli_stmt_store_result($check);
if (mysqli_stmt_num_rows($check) > 0) {
    mysqli_stmt_close($check);
    mysqli_close($con);
    die("An account with that email already exists.");
}
mysqli_stmt_close($check);

// Hash the password
$hashed = password_hash($password, PASSWORD_DEFAULT);

// Insert user
$insert = mysqli_prepare($con, "INSERT INTOusers0(username, password, email) VALUES (?, ?, ?)");
if (!$insert) {
    error_log("Prepare failed: " . mysqli_error($con));
    die("Database error.");
}
mysqli_stmt_bind_param($insert, "sss", $name, $hashed, $email);
if (mysqli_stmt_execute($insert)) {
    mysqli_stmt_close($insert);
    mysqli_close($con);
    // Registration successful - redirect to login page or welcome
    header('Location: https://4chuck.github.io/coolsite/index0.html');
    exit;
} else {
    error_log("Execute failed: " . mysqli_stmt_error($insert));
    echo "ERROR: Could not register user. Please try again.";
    mysqli_stmt_close($insert);
    mysqli_close($con);
}
?>
