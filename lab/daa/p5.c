#include <stdio.h>

#define MAX 10

int adj[MAX] [MAX];
int visited[MAX];
int stack[MAX];
int top = -1;

void push(int v) {
    top++;
    stack[top] = v;
}

void dfs(int v, int n) {
    visited[v] = 1;

    for (int i = 0; i < n; i++) {
        if (adj[v] [i] == 1 && visited[i] == 0) {
            dfs(i, n);
        }
    }
    push(v);
}

void topologicalSort(int n) {
    for (int i = 0; i < n; i++) {
        visited[i] = 0;
    }

    for (int i = 0; i < n; i++) {
        if (visited[i] == 0) {
            dfs(i, n);
        }
    }

    printf("Topological Order: ");
    while (top >= 0) {
        printf("%d ", stack[top]);
        top--;
    }
    printf("\n");
}

int main() {
    int n, edges, u, v;

    printf("Enter the number of vertices: ");
    scanf("%d", &n);

    printf("Enter the number of edges: ");
    scanf("%d", &edges);

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            adj[i] [j] = 0;
        }
    }

    printf("Enter edges (format: src dest):\n");
    for (int i = 0; i < edges; i++) {
        scanf("%d %d", &u, &v);
        adj[u] [v] = 1;
    }

    topologicalSort(n);

    return 0;
}