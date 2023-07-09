<?php
   $servername = "sql107.byetcluster.com";
   $username = "unaux_33994941";
   $password = "i6ho9gdu0z";
   $dbname = "unaux_33994941_Tony4";
     
   // connect the database with the server
   $conn = new mysqli($servername,$username,$password,$dbname);
     
    // if error occurs 
    if ($conn -> connect_errno)
    {
       echo "Failed to connect to MySQL: " . $conn -> connect_error;
       exit();
    }
  
    $sql = "select * from register";
    $result = ($conn->query($sql));
    //declare array to store the data of database
    $row = []; 
  
    if ($result->num_rows > 0) 
    {
        // fetch all data from db into array 
        $row = $result->fetch_all(MYSQLI_ASSOC);  
    }   
?>
  
<!DOCTYPE html>
<html>
<style>
    td,th {
        border: 1px solid black;
        padding: 10px;
        margin: 5px;
        text-align: center;
    }
</style>
  
<body>
       Name
                
        <tbody>
            <?php
               if(!empty($row))
               foreach($row as $rows)
              { 
            ?>
            <?php echo $rows['first_name']; ?>
            <?php } ?>
</body>
</html>
  
<?php   
    mysqli_close($conn);
?>
