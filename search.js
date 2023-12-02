function opener() {
    var text = document.getElementById('name').value;
    var targetNames = {


        codepen : "https://marvel24.000webhostapp.com/codepen/dist6"
        blog : "https://be-marvel.blogspot.com",
        dog : "DOG.html",
        cat : "cat.html",
        ironman :"iron%20man.html",
        nature :"sea.html",
        go :"go.html",
       blackboard :"black%20board.html",
        search :"search.html",
        calci :"calci.html",
        home :"index.html"
       
    };
    if (text in targetNames) {
        window.open(targetNames[text]);  
    }
}

document.getElementById('name').addEventListener('keyup', opener, false);
