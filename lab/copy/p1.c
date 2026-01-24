#include <stdio.h>
#include <stdlib.h>

#define SIZE 5

struct stack
{
    int top;
    int data[SIZE];
};

typedef struct stack STACK;

void push(STACK *s, int item)
{
    if (s->top == SIZE - 1)
        printf("\n Stack Overflow");
    else
    {
        s->top = s->top + 1;
        s->data[s->top] = item;
    }
}

void pop(STACK *s)
{
    if (s->top == -1)
        printf("\n Stack Underflow");
    else
    {
        printf("\n Element popped is %d", s->data[s->top]);
        s->top = s->top - 1;
    }
}

void display(STACK *s)
{
    int i;

    if (s->top == -1)
        printf("\n Stack Empty");
    else
    {
        printf("\n Stack content are\n");
        for (i = s->top; i >= 0; i--)
            printf("%d\n", s->data[i]);
    }
}

int main()
{
    int ch, item;
    STACK s;

    s.top = -1;

    for (;;)
    {
        printf("STACK OPERATIONS:");
        printf("\n1. PUSH\n2. POP\n3. DISPLAY\n4.EXIT\n");
        printf("\nRead Choice :");
        scanf("%d", &ch);

        switch (ch)
        {
            case 1:
                printf("\n Read element to be pushed :");
                scanf("%d", &item);
                push(&s, item);
                break;

            case 2:
                pop(&s);
                break;

            case 3:
                display(&s);
                break;

            default:
                exit(0);
        }
    }

    return 0;
}
