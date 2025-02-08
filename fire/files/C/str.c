#include<stdio.h>
#include<string.h>
void compare(char [ ],char [ ]);
void concat(char [ ],char [ ]); 
void length(char *[ ]); 
void main( )
{ 
int n,digit; 
char str1[10],str2[10];
do 
{ 
printf("press 1-compare 2-concatenate 3-length of string");
printf("\n enter your choice="); 
scanf("%d",&n); 
switch(n) 
{
case 1:printf("enter first string=");
scanf("%s",str1); 
printf("enter second string="); 
scanf("%s",str2); 
compare(str1,str2);
break;
case 2: printf("enter first string="); 
scanf("%s",str1); 
printf("enter second string="); 
scanf("%s",str2); 
concat(str1,str2);
break; 
case 3:printf("enter string=");
scanf("%s",str1);
length(&str1);
break;
default: printf("wrong choice");
break;
} 
printf("\n Do you want to continue(1/0)? ");
scanf("%d", &digit);
 }while(digit==1); 
}
void compare(char str1[ ],char str2[ ])
{ 
int i; 
i=strcmp(str1,str2);
if(i==0) 
printf("strings are equal\n "); 
else 
printf("string are not equal\n"); 
} 
void concat(char str1[ ],char str2[ ]) 
{ 
strcat(str1,str2); 
printf("concatenate string=%s",str1); 
} 
void length(char *str1[ ]) 
{ 
int len;
len=strlen(str1); 
printf("the length of string=%d",len); 
}
