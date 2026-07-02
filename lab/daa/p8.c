#include <stdio.h>
#include <conio.h>

#define INF 999

int min(int a, int b)
{
    return (a < b) ? a : b;
}

void floyd(int p[][10], int n)
{
    int i, j, k;

    for(k = 1; k <= n; k++)
        for(i = 1; i <= n; i++)
            for(j = 1; j <= n; j++)
                p[i][j] = min(p[i][j], p[i][k] + p[k][j]);
}

void main()
{
    int a[10][10], n, i, j;

    printf("\nEnter the n value:");
    scanf("%d", &n);

    printf("\nEnter the graph data:\n");
    for(i = 1; i <= n; i++)
        for(j = 1; j <= n; j++)
            scanf("%d", &a[i][j]);

    floyd(a, n);

    printf("\nShortest path matrix\n");
    for(i = 1; i <= n; i++)
    {
        for(j = 1; j <= n; j++)
            printf("%d ", a[i][j]);
        printf("\n");
    }

    getch();
}