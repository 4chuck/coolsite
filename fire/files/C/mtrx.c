#include<stdio.h>
void main()
{
int a[5][5],b[5][5],c[5][5],m,n,p,q,i,j,k; 
printf("Enter the size of first matrix\n"); 
scanf("%d %d",&m,&n);
printf("Enter the size of second matrix\n"); 
scanf("%d %d",&p,&q);
if(n!=p)
printf("Matrix multiplication is not possible"); 
 else
 {
printf("Enter the elements of first matrix\n"); 
for(i=0;i<m;i++)
for(j=0;j<n;j++) 
scanf("%d",&a[i][j]);
printf("Enter the elements of the second matrix\n"); 
for(i=0;i<p;i++)
for(j=0;j<q;j++) 
scanf("%d",&b[i][j]);
for(i=0;i<m;i++) 
for(j=0;j<q;j++)
{
c[i][j]=0; 
for(k=0;k<n;k++){
printf(" %d-%d ",i,j);
c[i][j]=c[i][j]+a[i][k]*b[k][j];
}
}
printf("A- matrix is\n");
for(i=0;i<m;i++)
{
for(j=0;j<n;j++) 
printf("%d\t",a[i][j]); 
printf("\n");
}
printf("B- matrix is\n"); 
for(i=0;i<p;i++)
{
for(j=0;j<q;j++)
printf("%d\t",b[i][j]); 
printf("\n");
}
printf("\nThe product of two matrices is\n"); 
for(i=0;i<m;i++)
{
for(j=0;j<q;j++) 
printf("%d\t",c[i][j]);
printf("\n");
}
}
}
