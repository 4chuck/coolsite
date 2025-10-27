<?php
// profile_edit.php
// Allows logged-in user to change name/email/password
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

$user_id = intval($_SESSION['user_id']);

// fetch current user data
$stmt = mysqli_prepare($con, "SELECT username, email, password FROMusers0WHERE id = ?");
mysqli_stmt_bind_param($stmt, "i", $user_id);
mysqli_stmt_execute($stmt);
mysqli_stmt_bind_result($stmt, $db_username, $db_email, $db_hashed_password);
mysqli_stmt_fetch($stmt);
mysqli_stmt_close($stmt);

// helper
function esc($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

$messages = [];
$errors = [];

// handle POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // sanitize inputs
    $action = isset($_POST['action']) ? $_POST['action'] : '';

    if ($action === 'update_profile') {
        // update name and optionally email (if changed) - require current password to change email
        $new_name = isset($_POST['name']) ? trim($_POST['name']) : '';
        $new_email = isset($_POST['email']) ? trim($_POST['email']) : '';
        $current_password = isset($_POST['current_password']) ? $_POST['current_password'] : '';

        if ($new_name === '') {
            $errors[] = "Name cannot be empty.";
        }

        if ($new_email === '' || !filter_var($new_email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = "Please provide a valid email address.";
        }

        // If email changed, require current password verification
        $email_changed = ($new_email !== $db_email);

        if (count($errors) === 0) {
            if ($email_changed) {
                if ($current_password === '') {
                    $errors[] = "To change email, enter your current password for verification.";
                } elseif (!password_verify($current_password, $db_hashed_password)) {
                    $errors[] = "Current password is incorrect.";
                } else {
                    // check if new_email already exists for another user
                    $chk = mysqli_prepare($con, "SELECT id FROMusers0WHERE email = ? AND id != ?");
                    mysqli_stmt_bind_param($chk, "si", $new_email, $user_id);
                    mysqli_stmt_execute($chk);
                    mysqli_stmt_store_result($chk);
                    if (mysqli_stmt_num_rows($chk) > 0) {
                        $errors[] = "That email is already in use by another account.";
                    }
                    mysqli_stmt_close($chk);
                }
            }

            // if no errors, update username and possibly email
            if (count($errors) === 0) {
                $upd = mysqli_prepare($con, "UPDATEusers0SET username = ?, email = ? WHERE id = ?");
                if ($upd) {
                    mysqli_stmt_bind_param($upd, "ssi", $new_name, $new_email, $user_id);
                    if (mysqli_stmt_execute($upd)) {
                        $messages[] = "Profile updated successfully.";
                        // update local cached values and session
                        $db_username = $new_name;
                        $db_email = $new_email;
                        $_SESSION['username'] = $db_username;
                        $_SESSION['email'] = $db_email;
                    } else {
                        error_log("Update execute failed: " . mysqli_stmt_error($upd));
                        $errors[] = "Database error while updating profile.";
                    }
                    mysqli_stmt_close($upd);
                } else {
                    error_log("Prepare failed: " . mysqli_error($con));
                    $errors[] = "Database error while updating profile.";
                }
            }
        }
    } elseif ($action === 'change_password') {
        // change password flow - require current password and new+confirm
        $current_password = isset($_POST['cur_password']) ? $_POST['cur_password'] : '';
        $new_password = isset($_POST['new_password']) ? $_POST['new_password'] : '';
        $confirm_password = isset($_POST['confirm_password']) ? $_POST['confirm_password'] : '';

        if ($current_password === '') $errors[] = "Enter your current password.";
        if ($new_password === '') $errors[] = "Enter a new password.";
        if ($new_password !== '' && strlen($new_password) < 6) $errors[] = "New password must be at least 6 characters.";
        if ($new_password !== $confirm_password) $errors[] = "New password and confirm password do not match.";

        if (count($errors) === 0) {
            // verify current password
            if (!password_verify($current_password, $db_hashed_password)) {
                $errors[] = "Current password is incorrect.";
            } else {
                $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
                $upd = mysqli_prepare($con, "UPDATEusers0SET password = ? WHERE id = ?");
                if ($upd) {
                    mysqli_stmt_bind_param($upd, "si", $new_hash, $user_id);
                    if (mysqli_stmt_execute($upd)) {
                        $messages[] = "Password changed successfully.";
                    } else {
                        error_log("Password update failed: " . mysqli_stmt_error($upd));
                        $errors[] = "Database error while changing password.";
                    }
                    mysqli_stmt_close($upd);
                } else {
                    error_log("Prepare failed: " . mysqli_error($con));
                    $errors[] = "Database error while changing password.";
                }
            }
        }
    }
}

// Close DB at end of script render (after possible updates)
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Edit Profile</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <!-- Bootstrap CSS (local vendor path used elsewhere in your project) -->
  <link rel="stylesheet" href="vendor/bootstrap/css/bootstrap.min.css">
  <style>
    body { background:#0f1724; color:#eef2f7; font-family:Inter, Arial, sans-serif; }
    .container { max-width:900px; margin-top:40px; }
    .card { background:#071022; border:1px solid rgba(255,255,255,0.03); border-radius:10px; }
    .form-label { color:#cfd8e3; }
    .help { color:#9aa4b2; }
    .btn-primary { background:#2d89ff; border-color:#2d89ff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="mb-0">Edit Profile</h2>
      <div>
        <a href="welcome.php" class="btn btn-outline-light btn-sm">Back to Dashboard</a>
        <form method="post" action="logout.php" style="display:inline;">
          <button class="btn btn-danger btn-sm">Logout</button>
        </form>
      </div>
    </div>

    <?php if (!empty($messages)): ?>
      <?php foreach ($messages as $m): ?>
        <div class="alert alert-success"><?php echo esc($m); ?></div>
      <?php endforeach; ?>
    <?php endif; ?>

    <?php if (!empty($errors)): ?>
      <div class="alert alert-danger">
        <ul class="mb-0">
          <?php foreach ($errors as $e): ?>
            <li><?php echo esc($e); ?></li>
          <?php endforeach; ?>
        </ul>
      </div>
    <?php endif; ?>

    <div class="card p-4 mb-4">
      <h5>Basic information</h5>
      <form method="post" class="mt-3">
        <input type="hidden" name="action" value="update_profile">
        <div class="mb-3">
          <label class="form-label">Full name</label>
          <input class="form-control" type="text" name="name" value="<?php echo esc($db_username); ?>" required>
        </div>

        <div class="mb-3">
          <label class="form-label">Email</label>
          <input class="form-control" type="email" name="email" value="<?php echo esc($db_email); ?>" required>
          <div class="form-text help">To change email, enter your current password below to confirm.</div>
        </div>

        <div class="mb-3">
          <label class="form-label">Current password (required if changing email)</label>
          <input class="form-control" type="password" name="current_password" placeholder="Enter current password">
        </div>

        <div class="d-flex gap-2">
          <button class="btn btn-primary" type="submit">Save changes</button>
          <a href="welcome.php" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>

    <div class="card p-4 mb-4">
      <h5>Change password</h5>
      <form method="post" class="mt-3">
        <input type="hidden" name="action" value="change_password">

        <div class="mb-3">
          <label class="form-label">Current password</label>
          <input class="form-control" type="password" name="cur_password" required>
        </div>

        <div class="mb-3">
          <label class="form-label">New password</label>
          <input class="form-control" type="password" name="new_password" minlength="6" required>
          <div class="form-text help">Use at least 6 characters.</div>
        </div>

        <div class="mb-3">
          <label class="form-label">Confirm new password</label>
          <input class="form-control" type="password" name="confirm_password" minlength="6" required>
        </div>

        <div>
          <button class="btn btn-primary" type="submit">Change password</button>
        </div>
      </form>
    </div>

    <div class="text-muted small">
      Tip: After changing email or password, remain signed in. If you want stricter security you can log out all sessions after password change (not implemented here).
    </div>
  </div>

  <script src="vendor/jquery/jquery-3.2.1.min.js"></script>
  <script src="vendor/bootstrap/js/bootstrap.min.js"></script>
</body>
</html>
<?php mysqli_close($con); ?>
