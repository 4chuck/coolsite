function store(){

    var name = document.getElementById('name');
    var pw = document.getElementById('pw');

    if(name.value.length == 0){
        alert('Please fill in name');

    }
      else{
        localStorage.setItem('name', name.value);
        localStorage.setItem('pw', pw.value);
        alert('success</br>redirecting to home page');
    }
}

function check(){
    var storedName = localStorage.getItem('name');
    var storedPw = localStorage.getItem('pw');
}

function copyToClipboard(elementId) {
alert("your password " + storedPw + " copied");

  // Create a "hidden" input
  var aux = document.createElement("input");

  // Assign it the value of the specified element
  aux.setAttribute("value",document.getElementById(elementId).innerHTML);

  // Append it to the body
  document.body.appendChild(aux);

  // Highlight its content
  aux.select();

  // Copy the highlighted text
  document.execCommand("copy");

  // Remove it from the body
  document.body.removeChild(aux); 
}
