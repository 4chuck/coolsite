from sympy import *

import numpy as np

import matplotlib . pyplot as plt

x , y= symbols ('x,y')

sol = solve ([3*x+5*y-1 , x+y-1],[x , y])

p=sol[x]

q=sol[y]

print ('Point of intersection is A (', p ,',', q , ')\n')

x = np . arange (-10 , 10 , 0.001 )

y1 = ( 1-3*x )/5

y2=1-x

plt . plot (x , y1 ,x , y2 )

plt . plot (p ,q , marker = 'o')

plt . annotate ('A', xy=(p , q ) , xytext =( p+0.5 , q ) )

plt . xlim (-5 , 7 )

plt . ylim (-7 , 7 )

plt . axhline ( y=0 )

plt . axvline ( x=0 )

plt . title ("$3x+5y=1; x+y=1$")

plt . xlabel (" Values of x")

plt . ylabel (" Values of y ")
plt . legend (['$3x+5y=1$ ', '$x+y=1$ '])

plt . grid ()

plt . show ()
