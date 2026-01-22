#include <stdio.h>
#include <stdlib.h>

void towerofHanoi(int n, char source, char temp, char destination)
{
    if (n == 1)
        printf("\n Move %d disc from %c to %c", n, source, destination);
    else
    {
        towerofHanoi(n - 1, source, destination, temp);
        printf("\n Move %d disc from %c to %c", n, source, destination);
        towerofHanoi(n - 1, temp, source, destination);
    }
}

int main()
{
    int n;

    printf("\n Read number of discs:");
    scanf("%d", &n);

    towerofHanoi(n, 'S', 'T', 'D');

    return 0;
}
