// Attempt MySQL server connection. Assuming you are running MySQL
// server with default setting (user 'root' with no password)
const link = mysqli_connect("db4free.net", "ohmshiva", "ohmshiva", "ohmshiva");
// Check connection
if(link === false){
    throw new Error("ERROR: Could not connect. " + mysqli_connect_error());
}
// Escape user inputs for security
const username = mysqli_real_escape_string(link, $_REQUEST['username']);
const password = mysqli_real_escape_string(link, $_REQUEST['password']);
const email = mysqli_real_escape_string(link, $_REQUEST['email']);
// attempt insert query execution
const sql = `INSERT INTO users (username, password, email) VALUES ('${username}', '${password}', '${email}')`;
if(mysqli_query(link, sql)){
    console.log("Records added successfully.");
} else{
    console.log("ERROR: Could not able to execute " + sql + ". " + mysqli_error(link));
}
// close connection
mysqli_close(link);
