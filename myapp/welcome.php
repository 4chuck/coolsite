<?php
// welcome.php - user dashboard
session_start();

// If not logged in, redirect to login
if (!isset($_SESSION['user_id'])) {
    header('Location: login2.html');
    exit;
}

// DB connection - use your local XAMPP settings (adjust if using remote host)
require_once __DIR__ . '/config.php';
$con = db_connect();

if (!$con) {
    error_log("DB connect error: " . mysqli_connect_error());
    die("Database connection error.");
}

// Fetch latest user info from DB (in case profile_pic changed)
$user_id = intval($_SESSION['user_id']);
$stmt = mysqli_prepare($con, "SELECT username, email, profile_pic, created_at FROMusers0WHERE id = ?");
if ($stmt) {
    mysqli_stmt_bind_param($stmt, "i", $user_id);
    mysqli_stmt_execute($stmt);
    mysqli_stmt_bind_result($stmt, $db_username, $db_email, $db_profile_pic, $db_created_at);
    mysqli_stmt_fetch($stmt);
    mysqli_stmt_close($stmt);
} else {
    error_log("Prepare failed: " . mysqli_error($con));
    die("Database error.");
}

// Safety: fall back to session username/email if DB values missing
$username = isset($db_username) && $db_username !== null ? $db_username : (isset($_SESSION['username']) ? $_SESSION['username'] : 'User');
$email = isset($db_email) && $db_email !== null ? $db_email : (isset($_SESSION['email']) ? $_SESSION['email'] : '');
$profile_pic = isset($db_profile_pic) && $db_profile_pic !== null ? $db_profile_pic : null;
$created_at = isset($db_created_at) ? $db_created_at : null;

function esc($s) {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

// Build profile image URL. If none set, use placeholder SVG data URI.
if ($profile_pic && file_exists(__DIR__ . '/uploads/' . $profile_pic)) {
    $profile_url = 'uploads/' . rawurlencode($profile_pic);
} else {
    // simple inline SVG placeholder (no external requests)
    $placeholder = rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="24" height="24" rx="4" fill="#2d89ff"/><circle cx="12" cy="9" r="3.2" fill="#ffffff"/><path d="M5.5 20c1.8-3.6 5.6-5 6.5-5s4.6 1.4 6.5 5"/></svg>');
    $profile_url = "data:image/svg+xml;utf8,{$placeholder}";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard — <?php echo esc($username); ?></title>

  <style>
    /* Minimal dashboard styling (self-contained) */
    :root { --bg:#0f1724; --card:#0b1220; --accent:#2d89ff; --muted:#9aa4b2; --text:#eef2f7; }
    body { margin:0; font-family:Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial; background:var(--bg); color:var(--text); }
    .wrap { max-width:960px; margin:36px auto; padding:24px; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border-radius:12px; padding:20px; box-shadow: 0 8px 30px rgba(2,6,23,0.6); display:flex; gap:20px; align-items:center; }
    .avatar { width:140px; height:140px; border-radius:12px; overflow:hidden; flex-shrink:0; border:4px solid rgba(255,255,255,0.03); background:#0b1220; display:flex; align-items:center; justify-content:center; }
    .avatar img { width:100%; height:100%; object-fit:cover; display:block; }
    .meta { flex:1; }
    h1 { margin:0 0 6px 0; font-size:22px; }
    .muted { color:var(--muted); font-size:14px; }
    .small { font-size:13px; color:var(--muted); }
    .actions { display:flex; gap:12px; margin-top:14px; align-items:center; }
    .btn { background:var(--accent); color:white; padding:10px 14px; border-radius:8px; border:0; cursor:pointer; font-weight:600; text-decoration:none; }
    .btn.secondary { background:transparent; border:1px solid rgba(255,255,255,0.06); color:var(--text); }
    .upload-form { margin-left:auto; display:flex; flex-direction:column; gap:10px; align-items:flex-end; }
    .file-input { color:var(--muted); font-size:14px; }
    .note { margin-top:10px; color:var(--muted); font-size:13px; }
    .panel { margin-top:20px; background:rgba(255,255,255,0.01); border-radius:10px; padding:14px; }
    .logout-form { display:inline; }
    /* responsive */
    @media (max-width:720px) {
      .card { flex-direction:column; align-items:flex-start; }
      .upload-form { width:100%; align-items:flex-start; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px;">
      <div>
        <h2 style="margin:0;">Dashboard</h2>
        <div class="small">Welcome back — basic account details and profile picture</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <form method="post" action="logout.php" class="logout-form">
          <button type="submit" class="btn secondary">Logout</button>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="avatar" title="<?php echo esc($username); ?>">
        <img src="<?php echo esc($UPLOAD_URL . rawurlencode($profile_pic)); ?>">
      </div>

      <div class="meta">
        <h1><?php echo esc($username); ?></h1>
        <div class="muted"><?php echo esc($email); ?></div>
        <?php if ($created_at): ?>
          <div class="note small">Member since: <?php echo esc(date('F j, Y', strtotime($created_at))); ?></div>
        <?php endif; ?>

        <div class="actions">
          <a href="#" class="btn" onclick="document.getElementById('file').click(); return false;">Change profile picture</a>

          <a href="profile_edit.php" class="btn secondary" style="background:transparent;border:1px solid rgba(255,255,255,0.06);">Edit profile</a>
        </div>
      </div>

      <div class="upload-form">
        <!-- Upload form posts to upload_profile.php -->
        <form id="picForm" action="upload_profile.php" method="post" enctype="multipart/form-data">
          <input id="file" class="file-input" type="file" name="profile_pic" accept="image/png,image/jpeg,image/webp" style="display:none;" onchange="document.getElementById('picForm').submit();" />
          <small class="small">Allowed: JPG, PNG, WebP — max 2 MB</small>
        </form>
      </div>
    </div>

    <div class="panel">
      <h3 style="margin-top:0;">Account details</h3>
      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:8px 6px; color:var(--muted); width:160px;">Username</td>
          <td style="padding:8px 6px;"><?php echo esc($username); ?></td>
        </tr>
        <tr>
          <td style="padding:8px 6px; color:var(--muted);">Email</td>
          <td style="padding:8px 6px;"><?php echo esc($email); ?></td>
        </tr>
        <?php if ($created_at): ?>
        <tr>
          <td style="padding:8px 6px; color:var(--muted);">Member since</td>
          <td style="padding:8px 6px;"><?php echo esc(date('F j, Y, H:i', strtotime($created_at))); ?></td>
        </tr>
        <?php endif; ?>
      </table>
    </div>
  </div>
</body>
</html>
<?php mysqli_close($con); ?>
