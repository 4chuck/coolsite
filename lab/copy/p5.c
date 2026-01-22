#include <stdio.h>
#include <stdlib.h>

#define SIZE 5

struct queue
{
    int front, rear;
    char data[SIZE];
};

typedef struct queue QUEUE;

void enqueue(QUEUE *q, char item)
{
    if (q->rear == SIZE - 1)
        printf("\n Queue full");
    else
    {
        q->rear = q->rear + 1;
        q->data[q->rear] = item;
        if (q->front == -1)
            q->front = 0;
    }
}

char dequeue(QUEUE *q)
{
    int del;

    if (q->front == -1)
    {
        printf("\n Queue empty");
        return -1;
    }
    else
    {
        del = q->data[q->front];

        if (q->front == q->rear)
        {
            q->front = -1;
            q->rear = -1;
        }
        else
            q->front = q->front + 1;

        return del;
    }
}

void display(QUEUE q)
{
    int i;

    if (q.front == -1)
        printf("\n Queue Empty");
    else
    {
        printf("\n Queue content are\n");
        for (i = q.front; i <= q.rear; i++)
            printf("%c\t", q.data[i]);
    }
}

int main()
{
    char item, del;
    int ch;
    QUEUE q;

    q.front = -1;
    q.rear = -1;

    for (;;)
    {
        printf("QUEUE OPERATIONS:");
        printf("\n1. Enqueue\n2. Dequeue\n3. Display\n4.Exit");
        printf("\nRead Choice :");
        scanf("%d", &ch);
        getchar();

        switch (ch)
        {
            case 1:
                printf("\n Read element to be inserted :");
                scanf("%c", &item);
                enqueue(&q, item);
                break;

            case 2:
                del = dequeue(&q);
                if (del != -1)
                    printf("\n Element deleted is %c\n", del);
                break;

            case 3:
                display(q);
                break;

            default:
                exit(0);
        }
    }

    return 0;
}
