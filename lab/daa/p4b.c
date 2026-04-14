#include <stdio.h>
#include <stdlib.h>

#define MAX 100

void BFS(int graph[MAX] [MAX], int n, int start) {
    int visited[MAX] = {0};
    int queue[MAX];
    int front = 0, rear = 0;

    visited[start] = 1;
    queue[rear++] = start;

    while (front < rear) {
        int current = queue[front++];
        printf("%d ", current);

        for (int i = 0; i < n; i++) {
            if (graph[current] [i] == 1 && !visited[i]) {
                visited[i] = 1;
                queue[rear++] = i;
            }
        }
    }
    printf("\n");
}

int main() {
    int n, i, j, start;
    int graph[MAX] [MAX];

    printf("Enter the number of vertices: ");
    scanf("%d", &n);

    printf("Enter the adjacency matrix of the graph:\n");
    for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
            scanf("%d", &graph[i] [j]);
        }
    }

    printf("Enter the starting vertex: ");
    scanf("%d", &start);

    printf("Nodes reachable from vertex %d using BFS:\n", start);
    BFS(graph, n, start);

    return 0;
}