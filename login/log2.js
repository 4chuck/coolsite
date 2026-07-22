var storedPw;

function store() {
    var name = document.getElementById('name').value;
    var pw = document.getElementById('pw').value;

    if (name.length == 0) {
        alert('Please fill in name');
    } else {
        localStorage.setItem('name', name);
        var encryptedPassword = CryptoJS.AES.encrypt(pw, 'VjG6e$hN9@Lp2*qZ').toString();
        localStorage.setItem('pw', encryptedPassword);
        alert('Success! Redirecting to home page');
    }
}

function check() {
    var stp = localStorage.getItem('pw');
    storedPw = CryptoJS.AES.decrypt(stp, 'VjG6e$hN9@Lp2*qZ').toString(CryptoJS.enc.Utf8);
}

function copyToClipboard(pw) {
    check(); // Retrieve decrypted password before copying
    var aux = document.createElement("input");
    aux.setAttribute("value", storedPw);
    document.body.appendChild(aux);
    aux.select();
    document.execCommand("copy");
    document.body.removeChild(aux);
    alert("Password copied to clipboard: " + storedPw);
}
