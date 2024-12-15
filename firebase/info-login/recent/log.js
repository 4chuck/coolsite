var storedPw;

function store() {
    var name = document.getElementById('name').value;
    var pw = document.getElementById('pw').value;

    if (name.length == 0) {
        alert('Please fill in email');
    } else {
        localStorage.setItem('name', name);
        var encryptedPassword = CryptoJS.AES.encrypt(pw, 'VjG6e$hN9@Lp2*qZ').toString();
        localStorage.setItem('pw', encryptedPassword);
    
    }
}

function check() {
    var stp = localStorage.getItem('pw');
    storedPw = CryptoJS.AES.decrypt(stp, 'VjG6e$hN9@Lp2*qZ').toString(CryptoJS.enc.Utf8);
}

function copyToClipboard(pw) {
    check(); // Retrieve decrypted password before copying
    alert("Your password: " + storedPw + " copied");

    // Create a "hidden" input
    var aux = document.createElement("input");

    // Assign it the value of the decrypted password
    aux.setAttribute("value", storedPw);

    // Append it to the body
    document.body.appendChild(aux);

    // Highlight its content
    aux.select();

    // Copy the highlighted text
    document.execCommand("copy");

    // Remove it from the body
    document.body.removeChild(aux); 
}