#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>

int main() {
    int fd;
    char *fifo = "/tmp/myfifo";

    mkfifo(fifo, 0666);

    char arr1[80];
    printf("Writer: Enter a message: ");
    fgets(arr1, 80, stdin);

    fd = open(fifo, O_WRONLY);
    write(fd, arr1, sizeof(arr1));
    close(fd);

    return 0;
}
