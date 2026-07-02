#include <stdio.h>

int main()
{
    int n, i, j, u, v, min;
    int cost[10][10], dist[10], visited[10] = {0};

    printf("\nEnter number of vertices:");
    scanf("%d", &n);

    printf("\nEnter cost matrix:\n");
    for(i = 1; i <= n; i++)
        for(j = 1; j <= n; j++)
            scanf("%d", &cost[i][j]);

    for(i = 1; i <= n; i++)
    {
        dist[i] = cost[1][i];
        visited[i] = 0;
    }

    visited[1] = 1;

    for(i = 2; i <= n; i++)
    {
        min = 999;

        for(j = 1; j <= n; j++)
            if(dist[j] < min && visited[j] == 0)
            {
                min = dist[j];
                u = j;
            }

        visited[u] = 1;

        for(v = 1; v <= n; v++)
            if(!visited[v] && dist[v] > dist[u] + cost[u][v])
                dist[v] = dist[u] + cost[u][v];
    }

    printf("\nShortest path:\n");
    for(i = 1; i <= n; i++)
        printf("%d -> %d = %d\n", 1, i, dist[i]);

    return 0;
}