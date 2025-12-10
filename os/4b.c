#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>

int main() {
    int fd;
    char *fifo = "/tmp/myfifo";
    char arr2[80];

    fd = open(fifo, O_RDONLY);
    read(fd, arr2, sizeof(arr2));
    printf("Reader: Received message: %s", arr2);
    close(fd);

    return 0;
}
