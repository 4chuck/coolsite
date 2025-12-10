#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    pid_t pid = fork();

    if (pid < 0) {
        perror("Fork failed");
        exit(1);
    }

    if (pid == 0) {  // Child process
        printf("Child PID: %d\n", getpid());
        char *cmd[] = {"ls", "-l", NULL};
        if (execvp(cmd[0], cmd) == -1) {
            perror("Exec failed");
            exit(1);
        }
    } else {  // Parent process
        printf("Parent PID: %d waiting for child...\n", getpid());
        int status;
        waitpid(pid, &status, 0);
        if (WIFEXITED(status))
            printf("Child exited with status: %d\n", WEXITSTATUS(status));
        else
            printf("Child terminated abnormally.\n");
        printf("Parent exiting.\n");
    }

    return 0;
}
