function opener() {
    var text = document.getElementById('name').value;
    var targetNames = {
  
        blog : "https://be-marvel.blogspot.com",
        dog : "http://4chuck.github.io/coolsite/DOG.html",
        cat : "https://4chuck.github.io/coolsite/cat.html",
        ironman :"https://4chuck.github.io/coolsite/iron%20man.html",
        nature :"https://4chuck.github.io/coolsite/sea.html",
        go :"https://4chuck.github.io/coolsite/go.html",
       blackboard :"https://4chuck.github.io/coolsite/black%20board.html",
        search :"https://4chuck.github.io/coolsite/search.html",
        calci :"https://4chuck.github.io/coolsite/calci.html",
        home :"https://4chuck.github.io/coolsite"
       
    };
    if (text in targetNames) {
        window.open(targetNames[text]);  
    }
}

document.getElementById('name').addEventListener('keyup', opener, false);