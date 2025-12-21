#include <stdio.h>
#include <stdlib.h>

#define TABLE_SIZE 10

int h[TABLE_SIZE] = { NULL };

void insert()
{
    int key, index, i, hkey;

    printf("\nenter a value to insert into hash table:");
    scanf("%d", &key);

    hkey = key % TABLE_SIZE;

    for (i = 0; i < TABLE_SIZE; i++)
    {
        index = (hkey + i) % TABLE_SIZE;
        if (h[index] == NULL)
        {
            h[index] = key;
            break;
        }
    }

    if (i == TABLE_SIZE)
        printf("\nelement cannot be inserted\n");
}

void search()
{
    int key, index, i, hkey;

    printf("\nenter search element:");
    scanf("%d", &key);

    hkey = key % TABLE_SIZE;

    for (i = 0; i < TABLE_SIZE; i++)
    {
        index = (hkey + i) % TABLE_SIZE;
        if (h[index] == key)
        {
            printf("value is found at index %d", index);
            break;
        }
    }

    if (i == TABLE_SIZE)
        printf("\n value is not found\n");
}

void display()
{
    int i;

    printf("\nelements in the hash table are \n");
    for (i = 0; i < TABLE_SIZE; i++)
        printf("\nat index %d \t value = %d", i, h[i]);
}

int main()
{
    int ch;

    for (;;)
    {
        printf("\n1.Insert\n2.Display\n3.Search\n4.Exit\n");
        printf("\n Read Choice :");
        scanf("%d", &ch);

        switch (ch)
        {
        case 1:
            insert();
            break;
        case 2:
            display();
            break;
        case 3:
            search();
            break;
        default:
            exit(0);
        }
    }
}
