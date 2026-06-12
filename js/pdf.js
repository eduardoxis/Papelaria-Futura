// ============================================================
// pdf.js — Gerador de Cotação PDF — Papelaria Futura Centro
// Usa jsPDF + jsPDF-AutoTable (CDN no dashboard.html)
// ============================================================

const LOGO_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADhAOEDASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAAAAIDBAUGBwEI/8QAVhAAAQIDBAUFCgkIBwYHAAAAAwACAQQFBhESEwcUISNTIjEzQnIVJDJBUVJigpKhCDRDYXGBkaKxFlRjc5Oz0fAXJSZEZHWVNWWjssHCJzdX0tPi4//EABwBAAIDAQEBAQAAAAAAAAAAAAIDAAEEBQYHCP/EADYRAAIBAwMCBAQEBQQDAAAAAAABAgMEEQUSITFREyJBYTJxgaEGFBWRM1KxwdEjQuHwYmPC/9oADAMBAAIRAxEAPwDmTWp/KGPpOXyfqTg2Zfb85MzBfkx+Av0afI8t9CmmOmJ2koZE1OfGy9pNjIs76nT25iW8uRTBqjCXLirCXOlyRhrUmuUWGFJSGlSnEQGXaxxNuajMTbnqEUWKWWtYCYmS8jwFo8xMzERkEji3F5NlpUdGpvSMvZVpBzRBkWgM5MBEMW8TZio5cvJtry8apvFEcoxHLwhVFMVEkMp02BnKMRySR6ac9Hg2wp4AjlGcluS8Ix7wiNLBqXAy1qgzcz8mNKnJkhOj8BNhluJyEZrhBR5kMDG8id3Yu2lEL8mNMYVY7r1J0i7NV1RpEkzNj9F0HKik35a21iijyipVR4WTl6jUlSpylEvmiGTL3X4JogctLCXK3fUepEWZm79lyI8q5ST6kLCNCf1cnoe1BChN/uBS7rL9pyaSRtTM0wiT4oUYrOCHM9KTtKGRtyvpcRCfJ434VJhIzHDYz7ESjnk0fmo0+GZkZU4OYy1oCSJBeZ7lnKwTKqD/AKvwVOCHUaka7xFEwc8l68qTMTjXodqGStY9S213517rirGuYjF+kVYQP5eJYOm1HmJtR3OTExmEFu+Wr2oZChHJKcdRiFTQ3breJJHD4itLA+NJJgQ6Yc9BMtNucNGaYQSBzk2vXOGm3HGNXgcov0HHOGNV5nkmSJeEkz2U70fRolHA6KUPmMNEMfSeGkEcQvYTuDiL25WMUvUi4ElWtDF/XUt+shiXRAyUCeIHuRZMd5qMbVpNZycoarSz89q02P0nQaujOphOEBRZwEBBLmCwcmPVh5EMuUYXrFKstjj19xeFOhJ8n1Fy8kxMfnBvainZc8xxDe1FTBHo3Gd/2/5Om43/AJzH2YoXOc6Y4j/aihUJ/Sf/AC+3/JuxuSTFQNyannLIc2Mcywyxkd4EnZh1rvH5U7y+j767PP71ClX5Ye21P4x8N/ZxbFqXQVKLyxZWfo2M7RL4rNVhnff2LQuJwxsZ+Ko6s7vtDLoarNtTKYgnpOQRSXJ4MiQvoMQuSXU6/i4XLIGQRGQRWrqeMXSETJGy/EYg8VPoCq+ehXkMMW78NPydQ1beZav7F06j1GqkHOYMOHzfGtB+TVL6PMDg7Mf4JU7mMXhpmS51KhSm6U4s5uSbGQvbTBBEWyt5R6HTdS7nlZym8rkxWZc6X9BMhVU47kjdbXMK1NVKaeH3K1wiJpwiKyJl+go5GjTlNm2NRlcQREuXHxE6Ro1Ik2y6Jz9h0qj2jPSRTjWKc4cuMvUT4Wy/oJbqYXQyzrccIppp2UnGszVPqwBkKPLweyn5cUv0fI8FTxMLJTrrYmlyRrPOGOoC9J2Fq3YG7ro2P9a6KxdPlsuqy5OpmwWwYT9Gx/qo088nJ1TEpqS7EjC//FdnFs+1NVBvekep4fguv8S8zB8P70bk1NEzAl6jMMeS36ERzKcXvRzNwsxPS4stJa/eKVhVs9lObSwCEYUKhJ0XVvYTBBefgVhh3KjTSFHkYyeSkmHd9JObvRdpInnd9k7SYE7vsfaSmjqxp5jk0tYaPufmDWWmHLV1z/ZKyeHMLl+0gpvjIjT+YN+55Jh+UJ6qmOnidGP2lFmj5W7H/MESjVNu7zM2yjuW6RLPLEyswnLTA5CYmejE96uSdDl+dyVsKPKDHSRs9FIrXHgpI5lfUZW8M4y2zEWPkZzu0QYx8vD50Ftu5tU4cPab/FQLJi/th6sVtnPHw1ir3c1Lojh6rqE/HWEuiOS6RJGcGaX1gf3oLMaqfh/gukaUmjLVZfqclZpsvLrXQuZOmmz0Om3r/KQbRlnS5OGmDAIL5NX00zfZaRVHjJKjGNaVWb9DrwuW2uOpnjAInJcRBKwcLdJwYbxDTPFHOvxhkCccQht2psqNPtllJcLeerBD4meDPUrprahUuFQJqW3u7VwPdpjDvlecGWnVak2NkAQYvsUEZy90Cbx/tRWntMPKp/2LJt+NvS6Et0ch2dXxqbkxNTOTO5BH+1FKDMkKUY8x/hQ60fKmZ7pUmU+ND7UPxWlLKN8YrYjatk5cn92D+zgn+50vwg+lyYJ2V/8At9Sk3K28HmJVpr1Inc6T4bPZahKyh+n7kKy/En3HWu+TzOX9SaMUZP58agNco88QnEelKaChRzIiVB3fRO0owHd9D7SvZUQyCHu2Pe5vWan9Rl+Ez1WwV7co1fmYxW1ol1re0r1VlAt3RCeqtMaG6y8x7mYcXK5lQVBwxFKMfI5UPwSJQ2xF2PEXApSOzZpXEjJkIqJrt6TtK7o5yZo94mtccHTulKMPKXtFkMyaGQnVctOPXMnLH4CyclUMqrZfUxLQtrWWuZdRk5I8xfU605LjJ7ZkmrWqHmebFa90zL/eXPpeoDHW9c6inTFoJfiLJVoym0/Yw3ljUr1FJL0QaRnazVZfsrMkETpOopteqg5kwyMVWSc3ODMWujBxgkdqxoTp0IQx0Iht5NoIBKmiS4jDKPl4m8pK1ka0HU8ySaIhBpxo90N/pII8adxj1VEwm3hChtUkjd79jVAz8rtqfLvHlIoxa5E1E1yPuEPJGojYZZlLxDTBGpiYmDfRllaxwyU/1oLHEFcZa+eEO4XaglDk5cnyTP2cIobVeQq0uFQppdepkGgzOkTAx5U2L9ZD8VttRl+Ez9m1MTUnLigXvYONrY8rDBaVHBrhqCzjBMC8Y/8AuUnH+k8Nc9DNzhf7yb9pFSHTM5D+8l9qKpsVPTHn4jbat+kehYrWpj85N7UUK9xX6fL+b7Fq45FGM96dcmCJKGU4pMvqZ8UE/wA0amB+T3eP0lBp7u9B/q1Jdl5Xmdq9PXQ51ReZnpnE9NnorO1T/aBPq/CCvyc/qrU2G0b2itWElQlKSTVMWHWzOaILtnii6ML/AKr1jv7qla0vEqySXvwPtFPc9kXJ9kcfgIma/d9ZWtKGSBl2pug+1m81eXo5uV1aiJNk0IaQI9HSKf6tRD/Fc79f05r+NH90dWpTu6ix4LONDffW/WV84ROG9dMp2gu3ctNjmCUSWfgdysM8D/3qj0jyFTsnNDkKvSiShitxDxXRg+Hlg6GyKW9UtbmqoUaik/Zo5d7TuYyivCaXdp4MY58n8omM+lqBNPzUuVlmR6RbdqxllqilHLbPSFl1X1TLF0a1rrEVcllCWnAOVfINxuc3WG52Fr2jc/L54wg4jIX+lBR5Wy9UnrKTloxyzH06nlGA5cUL2udGENkOeO1zb/Jih5UFO6oNvzrh4+vb5m2FKUGnh9M/TuYjPInBnJ/LVtaVYSr1azU7aCQFLPk5JxM1rjtYR2WOBCRa2PhXMjfsUOUslUJmyEzahmqsp0pM6s/EaECOJcONzW+PYRq1fnbbLW5cNL6v0Ni8yzt9MlC7m6RR2lIries/OS1Jp1UmBs1apZurOxXxdlPg198PFtinp6ylYkbKydqCS2Clzp3y4C4oXuey/nhzwhyXXdmPkR+NRWMtcvC+fPHz4ZUY9eChG1SRq/8AyLrg7FDthlyr6a9uLkzDc5jc6IYPiPnuzGxheq6YpU5JUqnVSYEzVqkwpJZzXXudARIidfDxcpsVUbmlU+CSfLX1Sy188FVKUsZaIeIiS4pFfWjszWLOBpZKpLZLKlJsnZblQjiE7mv8kebZHbtgqEiKlVhVjug8oS4OLxJFtnkIUf6yCt5dxPT7KqBt3ov1kFZj6VHb/Ccq4xwkSCfqur4X1KNNfFPVi1Lbl9vs33pqaduSeg2KeJh8SMTT3KTNPVM0hFJl8xC4+p6mpR827JKxIXm1CHIvajbanDhM90YprIBwmezBSMonY9LEnJiG63nLf52H+b0eEea3vuUpMzOJvXsZi5LWu8FLDHiTL/aiiYJL5xMzw8SbbMyaQ85Nj3SXT7Gp0d06Tr9taXSJgm6m5pjS8qN7hw2uh82yEV2aSHIWt0tEo9fGw1m6ZMkkpOkbNWdks5bnD5nwhePZ5I3eLbyjQiSnl0q2ey/Dz34fqG+P/RdSsHll0y1Hz+69Xw+wBfNfxi3UvadOT4UJP6+b/CPRaMvDt3OKw3JL6cL+52x+jXRvMC3lgLJmZ6VGlow/5Ex/RXow/wDTixn+gy3/AMauaTPjFK6vMdTo/Hs8i+QtNNsrSUCvjkB2xrQTPlGzJMNTKzE8r3PvuvuhC66EIQ2YYLyOlabV1Ov4FJpPGefY9Bc3Ct4bmm/kbv4TFlbCWflKUSzlnKHS59jyEme58qMF4bsMMUGQhCO9iOEPHz+kq7SxMDJoAsBTyfGcUuYfJ8EWruhGF/0xguFjrFQrZh6/Upqc3kHYiki9zo80Ixj443R8flXatKjP/DrR5L/7tH/yQXs6ekT0uVrTqSTk5t5XosdM9Tz13eKqq0orHl/uSrO6AR1az9OrH5UZOuygpjK1C/BjZB11+Zt51NJ8HTh2tZ/pn/6rslg25VhLOj8ymy37lqyMzLaX9cJqlSkMjHHLa4QebxdRcX9f1OdacY10km+u1evyNErG0p0YTlTcm0umX6ezPnO0s5WJaUJYsk899Npk3MDyhOcxh3Zm1zm33R2jhGF/Neo0vbSv02zRLMScZJlNKE4yidLMi4mddidF/PfDLZhujDwYc9y7xovsNZi1NEqNYtBTozk+WoFxFacg+eDXR2MjCHO+K5Lb2zlLkdNI7Py8tgpr6hKS+VmOjuyRHB8MUY3+OO29ewstRs7ipO3nDLppyfCxldWvfng4tOFxGEKyl5Z8Lnn5Mx8paWrjs0SzAJ54acWZjNHEJzmZrosay510eU25sNkfGut6L9HtctRolJKS9bpktSp2efMOESUeQjSQgNt8HQfCHybdkYRWi0taKbB2b0dVGuUukvDOS7gYSunTPg2DjjbHY593NGK6xYelWbolE7n2TKF9KYV+FwJuMxDFGO2GK+P2Xrh6x+JqNS3jKyi4tyy24rqvX15zg7lpps41WqzysY6/94Pj+3r52iZlgJzufOBoU4VoJxsvFhuVHE+EI380Y3bPmgolRtnW52yo7LzBJLuWIEuEQmyzIOHkxdFroO8K+OIl98eu/mvX0TaqwGjuv6VZKXmB65OVBs4epNBUXXjeOAsOJsI8jwo7Ni598ITR3ZOxwrPdw5Y0trsyQZ8Uy8mKEMu67HfdzxXW07X9PupU6E4Pf8XRY3Yy2ueMtZ6f1M1eyuKSlNS46fT0OZTFr63M2KHZAhQvo8u6DhCwxvY6BCExQjfzxiV0I/Nd5IKqnqlMTtKpVLmMD5alCKOWbhujcUkSuvj4+W6K+p7M6DNHc7RJKYmKbOvMUUHOdr74Yo/VsWc0R6IrB2ksp3QqEtUDGz8tztbczqNjzQ+eKqn+LNJgnKMJLzZ6Lq08vr1xkJ6ddZScvTucOtrbmv2tENlcLKmypkhwOHLMHEWZBsIshh6lzW898dnOsm5q+uLX6BbEDsrODokueXqTyhaCcPMFLEd5mQjCA4RhCOyMYQv8vP41JoPwedH8iL+tO6FYN1nEm4jY36IDu98Yo6H4v0m3o4pRkl2x9+uPuXLTLmU/M0/fJ8ozBcuV9aCia1MfnJvaivsKe0A6N5kuYOWqYQvb0QJ2MWfTCLr4+9cC+ETYqiWFtVT6fQ9Z1aYp+e7PJmRx5jm893NdCC6OlfiWzv6yt6Se55fK7fUzT0ypbwcp46nLJqdqGbu5037SKRLz05rYxlmTvbig3pI+VBiDVjTu5/ynh4ofavT7sIU5xhHmP2LvUpP8xD+zgnxyI/zYLPVhBSZVvSef53Om3CJ2/SxIzzrqzfDY1qP+G/4aE7kdj2oIVYRXiPuJ3fp+5LMfM5HmqA2ZStcGg8RBOlLsQJyUIUxSec5RXU4i0A3ZnrJwwctVtfUeruceC20BU84tMFnSE8DPL+4Ius6PWZmnCdJ5lVrHvYD+Cw2gxg/6VaCT0yu/4Bf4Lb6MZoYtLU7rHI1ir1doMWzMjCANkPLHn+xfNPxam9Tiv/VL/wCz02lVpVLXL/nX9UdzwrxwBl6QbH9pt6W5wxi1iY5AWcpznbINh5Yr460i2mrArQDl6PbGtPCKny7SuBUzXOLgvdfGD9sdu1eU0XSKup13ShLbhZz+x3Lu6hbQ3y5OzfCWk6f+T9KmNWlc7WSNzctuNrcF90I892ODf5is3pOZ/YWwH+UC944Lj8jMWgtJUZOXmJ6pVicc7LAI8y879u26GKPzQj9S7PplH3NotlbP6yw05JU8Qytb6LMMXfRGPN9EV62Olz02rb20p75bnL5LH+TzF/dK4pV6uMLal9c5O0WPd/Y+hD/3fL/u2rAzWlqckqgSX7gAflEjD47HlXR/VpNn9KFDkaLTpOYkqs80vLCC5zBjw3tZCEbt5zbFyiqTBZmqzBx42BKZ7m4+fDGOy9c3TNDdW5qu7pvHpn5+z7CNX17wrakrKqt3r0fp7rudw0ERusfMf5gT92JYO3NlqhO6bxzg6dNPxVKVK0jROwZbYjjF1/NdC6N/0KNo2toSy5iDnBPmZGYucVg7sY3Q6zb9kdni+aC6LOaWrLy0rjlx1CZN1R5cGbfnjGP8UVa3vrK+q1KFPcpppY9wbK9srqxo06tbZKm8v3xn7MmadhZmh+ujJ12g/fjVf8GsQ5bRfLjH4GuH/FZjSVpXs/aCyFRoUnTamGZmMvC44xwZsI12258Y+JV+i7SpQ7JWQHR6hTanMmYchMQGjwXOjfDnfCKzPSr16WqPhvO/OPbGDrLVbV329VFt24z75JlgZfL+E1aWY87Pb7ofwVl8Jui1Cr0+zxJOSmZnV5smLIbF+CLoMuvu8XIiuZflySW0lTtq6OJ+GYmYkaA90IubHqxuvuj9C65TdOFkySuZOS1WljcJo2k2/NGEfxuWm5sL+2u6d1Sp7vKl8nt2vINvqNrXoTo1J7Xl8+2c8HQrEgmJaylKl5wb2GYBmJrudsee6KxPwa91YSYH/jo/uxqsDp8s38pRKz4UfBaKOy/Z1/Isno90y2bsbRSUucpNWMZxc3GBosO1jYeN8PIuPHQNRcWlRfX29zprVbSU0lUXR/2NNQXEmfhC10k5MvNqU2IYhOdGMBNjLtw3Q5ocvF71afCcp9qKlo6GOy4502CeGSeFKXxIQNztkIQ2xhjy43Q8nzLg9W0kTAtKtRtpZ8Zgy06VmOWmbt4ODGQudhjG6N7b4RhzfbBdZovwjbLlEMdYpFWljYeU4TRmZf7cI+5dmtoeoWlzSu6NLfhRbXZpJNNCaV/Qq05UpTw8vk0mgenViRohO6AnhC9rOS5sWQcXZii2Hk5+bYuPfDGbmW1o3+Wx/fOXSp74QlkxzWXL0msmD4ObhGyLo/Rj5lyjTJa2l26rcnUJORmpZkvLZWGZw3ujii6+F0Y+VafwxpN7R1JXFWk4x83yWRGpalb/AJbZCe58HEJwaYlfjYv1kPxW5HISZOklmezBMmkJMUI95BY9l7m7vbevqaWDhU9Rh8LTJoS5frIdq/ps+yKyOu1DimQ6qTghdI/2lW4zfp0/Rmt739P3IWG7sVDjG9pCLLD/AEmp/Mi/TTlMyV46XWZsUppFlS3bkfZh9njUneCF/POoko7KGPsp5xeH7TloXQxT5kyfQavOUCtydYp+BkzKOxMxtvg6++EYRh5IwjGH1rV1rSvT6kbLqejizM/gI4jc8EH8p10Xx2s54xhD7ILA4k0OWzSlJ6UPwXI1LSrO6aq1oZkuE+Vx9GbbS+q20XGMsI1LtJFl83/ycsF4XWkBx/7E+3SlRB9HolsH/pzP4Lm0Gb0naivXC3qzR0DT8fw/vL/J1ZajXfWX9DqMnphqEt3vZyy1lrMPNySHptOawjofTzfbCKpD1M8zNEnJshJgxXYilK6MXuj5YxistTZbvoXaWgyFFp9tay/0oJZ/f93ycTU7qVaSjOWV9v2LQdUGndeGqZoktrFHTRwpW9Pqi21tNumVBanEOxAqjFFvWTyZJXvcslgwiwgbKXGa6EIYoxJgh47/ABxvvhs8kGePJkoFPl2ZOssa/PbhhB9+YSMIxjl7eRFvXj9GxQnJhLhbRSSz0efsb1WfPBd1CYohKIQcuJjJ9rZUfJDhzIQDHMdf4nY43R8vIjt5UVBm5kZaVJS48jOE4ma5su1j7tmG90IXx63jUK5FyKFtGGOW8PP2wHK4cvT0wXFamaWWlSbJMTNYY0TSuy2sjsAyEYwjBkL7yZmLHGO2EIt53KrtEel6rMDGWSfjlpdssAcpgOIsMOY5xMEL4XQJ1434mbIXbG7lTVJ+ZNky+ymW9nFNLLwufvn/AL9TVbXEnNvHoQkhzU8vMK7JqTJ0w3o+1BSA9L6sfwXs4PdD7UEjEhtOYMw7sxQ+NxCC+6m5x26y/R/6IaXicv8AFeTDsyHqrUUuqIgQS5BbxQqoCniElTGYQXmKtILiecsyR0KNNuW5yIOXL+mhW/eaEeTb+YfZlglYk3iRiSjlYFOKRJccibdzJozkfIyMEwJNTHEUulnJlE7Sr1ZUlu6J2kut8BdbCh0ILul9aKS9yCdMTtRRCCNdBrROp5O+x9pX7XrNyPxoXaV4sVysyRzbyKckScSU1yYa5KWfCMLih/EqqrFJre7I9nJh1lYKoq3xv1YJtuvOPtV5xlxy8R/tRSHFLxH+1FJQt+1HRSQrPJxH+1FGaXiP+2KaS1Nq7FvApxS8R/tRSUIVpYKEIS141WFktqp8U9aCqM8nEeresfFfWgqSPOkUPhE2qzAS6ZmOI9KHMk4ijGamHOWhZZuVNSWCxUGYTWtkTTplXgZToyTHEKPnoVmjZIvklKQgOYISHQTrklQJCcKsqOPdE7Sr1aUToS9pJrvyCbiT8NlURu+J2or3CvT9MTtRXrUyPQc2PSDe+xdpXmFZ9rstWgqmP5Qb8forPXg28ox3MJTacSchRO6ctw3+5HdOW4b/AHJHhT7GTwKnYmqoq3xv1YKS6pj4b/cq0xMw2Y9No05KWWPt6UoyyxKEIWw2AhCFCAhCFCApNLFmTWZ1GcpMywCTJssftearZzhyUr/PKikVan+1dRNWePLHqyHWjb0Y4dXlO+lVjk4R2ZHMIm486ZCO2OB9KKjFIYI1MFapJIJlzUw0wZDMNRCKwI1RiDRo105kTEhOZaFZoyjUJCWkJRwkCQ5LSFBiBT6SfLzB+dymqAk4kE4blgGcFOO1lianxKXMERnK6rkNphOIz3qMOamL+l/BL16c4v3YJKjVXqKcaq4TRJ7mE4jPejuYTiM96ZbPTHF+7Be69OcX7sEWKvcHFbuh7uYTz2e9Hcwnns96Z16Y4v3YI16Y4v3YKbapW2t3Q93MJ57PejuYTz2e9M69OcX7sEa9McX7sFWKpNtbuh7uYTz2e9Hcwnns96Z16Y4v3YI16Y4v3YKbavcrbW7oe7mE89nvR3MJ57PemdemOL92CNemOL92CvbVL21u6H+5ZOIz3p4dOGPpCY/dBQtemON92CaIUhekI96FRqPq8FbKr6yLU05LywssfL9FvMqoxSFLjIkpCZCkoB06Sh06gkOS0lNHiHJp0E+5NO51A4vkjOao5GqW5qQRiI0xlghXIT+UhTI3ei3QhJQnNPXJtKSHRUCSBCTiQoFgW1KSF6oUONXqQ1LUBFoSEKAYBCEKBAlpCFChaEIUKBCEhQgIQhQIEIQoUeOSXNS0lQIawJpzVJcmiKDIy5GUJWFCsYSUlzkOaReOgThqhKQOim8SVgJw03lE4aiGLHc9XqTlE4aVlE4SvKLeH6gnGxTeAnDS2jIqAeO44lNTbWkSlABaElChQpC8wowqEPULzCvVCgQhChAQhChBaQhLUB6AkJaFCCElKXmFQJCU2ROOakOYThqk8jIrkaQvMonDQiG8dyc5JQhUZULQhCFlAhCFGUwSEIVEQtCEIyzxy9QhQgIQhQgIQhQgIQhQgIQhQgIQhQgIQhQgIQhQh41DkIUIeoQhQM//2Q==";

export function gerarPDF(cotacao) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const PW = 210;
    const MX = 14;
    const CW = PW - MX * 2;

    // ── Cores ──────────────────────────────────────────────
    const C = {
      azulEscuro : [10,  36, 114],
      azulMedio  : [21,  82, 181],
      azulClaro  : [41, 121, 255],
      azulTH     : [21,  82, 181],
      branco     : [255, 255, 255],
      cinzaLinha : [220, 228, 240],
      cinzaFundo : [247, 249, 252],
      cinzaTexto : [100, 116, 139],
      pretoTexto : [30,  30,  30],
    };

    // ── Helpers ────────────────────────────────────────────
    const rgb  = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

    function fmtMoeda(v) {
      return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(v)||0);
    }
    function fmtNum(v) {
      const n = Number(v)||0;
      return n % 1 === 0 ? String(n) : n.toFixed(2).replace(".",",");
    }
    function sanitize(s) {
      return (s||"cotacao").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"_").substring(0,30);
    }
    function dataHoje() {
      return new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
    }
    function aplicarCNPJMask(v) {
      const d = (v||"").replace(/\D/g,"").substring(0,14);
      if (d.length === 14)
        return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5");
      return v || "";
    }

    // ── Ícone pino localização (SVG-like com shapes) ───────
    function drawPin(x, y, r) {
      fill(C.azulMedio);
      doc.circle(x, y, r, "F");
      fill(C.branco);
      doc.circle(x, y + r * 0.5, r * 0.35, "F");
    }

    // ── Ícone telefone (retângulo arredondado) ─────────────
    function drawPhone(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
      fill(C.branco);
      doc.roundedRect(x+0.8, y+1.2, w-1.6, h-2.8, 1, 1, "F");
      fill(C.azulMedio);
      doc.rect(x+0.8, y+1.2, w-1.6, h-4.8, "F");
    }

    // ── Ícone pessoa (cabeça + corpo) ──────────────────────
    function drawPerson(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      fill(C.branco);
      // cabeça
      doc.circle(cx, cy - r*0.22, r*0.33, "F");
      // corpo (arco)
      doc.ellipse(cx, cy + r*0.5, r*0.42, r*0.3, "F");
    }

    // ── Ícone calendário ───────────────────────────────────
    function drawCal(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1, 1, "F");
      fill(C.branco);
      doc.rect(x+0.5, y+h*0.35, w-1, h*0.58, "F");
      fill(C.azulMedio);
      // grid linhas
      const cols = 3, rows = 2;
      const cw = (w-1)/cols, ch = (h*0.58-1)/rows;
      for (let r2=0; r2<rows; r2++) for (let c2=0; c2<cols; c2++) {
        fill(C.azulMedio);
        doc.roundedRect(x+0.5+c2*cw+0.5, y+h*0.35+1+r2*ch+0.5, cw-1, ch-1, 0.3, 0.3, "F");
      }
      // alinhas do topo
      fill(C.branco);
      doc.rect(x+w*0.3, y-0.5, 0.8, 2, "F");
      doc.rect(x+w*0.7-0.4, y-0.5, 0.8, 2, "F");
    }

    // ── Ícone carrinho ─────────────────────────────────────
    function drawCart(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      draw(C.branco);
      doc.setLineWidth(0.7);
      // corpo carrinho
      fill(C.branco);
      doc.triangle(cx-r*0.55, cy-r*0.15, cx+r*0.55, cy-r*0.15, cx+r*0.4, cy+r*0.35, "F");
      doc.setLineWidth(0.3);
      // rodas
      doc.circle(cx-r*0.2, cy+r*0.52, r*0.14, "F");
      doc.circle(cx+r*0.3, cy+r*0.52, r*0.14, "F");
      // cabo
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.7);
      doc.line(cx-r*0.7, cy-r*0.5, cx-r*0.55, cy-r*0.15);
    }

    // ── Ícone check (tick dentro círculo) ──────────────────
    function drawCheck(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.9);
      doc.line(cx-r*0.4, cy, cx-r*0.05, cy+r*0.4);
      doc.line(cx-r*0.05, cy+r*0.4, cx+r*0.45, cy-r*0.3);
    }

    // ── Ícone texto/obs ────────────────────────────────────
    function drawDoc(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1, 1, "F");
      fill(C.branco);
      const ly = [y+h*0.3, y+h*0.5, y+h*0.7];
      ly.forEach(ly2 => doc.rect(x+0.8*w*0.15, ly2, w*0.7, 0.6, "F"));
    }

    // ── Gradiente fundo azul (simula faixa) ────────────────
    function gradRect(x, y, w, h, c1, c2) {
      for (let i = 0; i <= h; i++) {
        const t = i / h;
        doc.setFillColor(
          Math.round(c1[0] + (c2[0]-c1[0])*t),
          Math.round(c1[1] + (c2[1]-c1[1])*t),
          Math.round(c1[2] + (c2[2]-c1[2])*t)
        );
        doc.rect(x, y+i, w, 1.1, "F");
      }
    }

    // ══════════════════════════════════════════════════════
    // 1. CABEÇALHO
    // ══════════════════════════════════════════════════════
    const CAB_H = 46;
    gradRect(0, 0, PW, CAB_H, [8, 28, 95], [18, 65, 155]);

    // Linha divisória vertical central
    draw(C.branco);
    doc.setLineWidth(0.35);
    doc.setDrawColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.3 }));
    doc.line(PW/2 - 8, 6, PW/2 - 8, CAB_H - 6);
    doc.setGState(doc.GState({ opacity: 1 }));

    // ── Logo real da empresa ───────────────────────────────
    const LX = MX, LY = 5, LW = 52, LH = 36;
    doc.addImage("data:image/jpeg;base64," + LOGO_B64, "JPEG", LX, LY, LW, LH);

    // ── Dados contato direita ──────────────────────────────
    const DX = PW/2 - 2;

    // Endereço — pino
    drawPin(DX + 3.5, 13, 3);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    rgb(C.branco);
    doc.text("AV. DR. ÉZIO CARNEIRO QD.32 LT31/33", DX + 9, 12);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 195, 255);
    doc.text("SETOR AEROPORTO, LUZIÂNIA/GO", DX + 9, 16.5);

    // Telefone — ícone
    drawPhone(DX + 1, 20.5, 5, 7);
    doc.setFont("helvetica","bold");
    doc.setFontSize(13.5);
    rgb(C.branco);
    doc.text("(61) 99918-4452", DX + 9, 26.5);

    // CNPJ
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 195, 255);
    doc.text("CNPJ: 01.064.836/0001-12", DX + 9, 33.5);

    let Y = CAB_H + 7;

    // ══════════════════════════════════════════════════════
    // 2. TÍTULO
    // ══════════════════════════════════════════════════════
    doc.setFont("helvetica","bold");
    doc.setFontSize(18);
    rgb(C.azulMedio);
    doc.text("Cotação", PW/2, Y + 1, { align:"center" });
    Y += 11;

    // ══════════════════════════════════════════════════════
    // 3. CARD CLIENTE / DATA
    // ══════════════════════════════════════════════════════
    const CARD_H = 24;
    fill(C.branco);
    draw(C.cinzaLinha);
    doc.setLineWidth(0.4);
    doc.roundedRect(MX, Y, CW, CARD_H, 2, 2, "FD");

    // divisória vertical
    const DIV_X = PW/2 + 8;
    draw(C.cinzaLinha);
    doc.setLineWidth(0.35);
    doc.line(DIV_X, Y+2, DIV_X, Y+CARD_H-2);

    // ícone pessoa
    drawPerson(MX + 9, Y + CARD_H/2, 6.5);

    // dados cliente
    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("Cliente:", MX+18, Y+7);

    doc.setFont("helvetica","bold");
    doc.setFontSize(9.5);
    rgb(C.pretoTexto);
    const nomeCliente = (cotacao.cliente||"—").toUpperCase();
    doc.text(nomeCliente, MX+18, Y+13.5);

    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("CNPJ:", MX+18, Y+20);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    rgb(C.cinzaTexto);
    doc.text(aplicarCNPJMask(cotacao.cnpj), MX+28, Y+20);

    // ícone calendário
    const CX2 = DIV_X + 10;
    drawCal(CX2, Y + CARD_H/2 - 6, 10, 10);

    // datas
    const dataEmissao = dataHoje();
    const [dia, mes, ano] = dataEmissao.split("/");
    const MESES = ["","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
                   "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

    let validadeTexto = "30 dias";
    if (cotacao.validade) {
      const hoje = new Date();
      const valid = new Date(cotacao.validade + "T12:00:00");
      const diff = Math.ceil((valid - hoje) / 86400000);
      validadeTexto = diff > 0 ? `${diff} dias` : valid.toLocaleDateString("pt-BR");
    }

    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("Emissão:", CX2 + 13, Y+7);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text(dataEmissao, CX2 + 13, Y+13);

    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("Validade:", CX2 + 13, Y+18.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text(validadeTexto, CX2 + 13, Y+23.5);

    Y += CARD_H + 7;

    // ══════════════════════════════════════════════════════
    // 4. TABELA
    // ══════════════════════════════════════════════════════
    const itens = (cotacao.itens||[]).map((it, i) => [
      String(i+1),
      (it.descricao||"—").toUpperCase(),
      (it.marca||"-").toUpperCase(),
      fmtNum(it.quantidade),
      fmtMoeda(it.valorUnitario),
      fmtMoeda(it.valorTotal),
    ]);

    doc.autoTable({
      startY: Y,
      head: [["ITEM","DESCRIÇÃO / PRODUTO","MARCA","QUANTIDADE","VALOR UNITÁRIO","VALOR TOTAL"]],
      body: itens,
      margin: { left: MX, right: MX },
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: { top:4.5, bottom:4.5, left:4, right:4 },
        textColor: C.pretoTexto,
        lineColor: C.cinzaLinha,
        lineWidth: 0.25,
        valign: "middle",
      },
      headStyles: {
        fillColor: C.azulTH,
        textColor: C.branco,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        minCellHeight: 10,
      },
      columnStyles: {
        0: { cellWidth: 14,  halign:"center", fontStyle:"bold" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 28,  halign:"center" },
        3: { cellWidth: 24,  halign:"center" },
        4: { cellWidth: 32,  halign:"right"  },
        5: { cellWidth: 32,  halign:"right",  fontStyle:"bold" },
      },
      alternateRowStyles: { fillColor: C.cinzaFundo },
      bodyStyles: { fillColor: [255,255,255] },
      tableLineColor: C.cinzaLinha,
      tableLineWidth: 0.3,
    });

    Y = doc.lastAutoTable.finalY + 6;

    // ══════════════════════════════════════════════════════
    // 5. CARD TOTAL
    // ══════════════════════════════════════════════════════
    if (Y + 26 > 272) { doc.addPage(); Y = 16; }

    const TOT_H = 24;
    fill(C.branco);
    draw(C.cinzaLinha);
    doc.setLineWidth(0.4);
    doc.roundedRect(MX, Y, CW, TOT_H, 2, 2, "FD");

    const T3 = CW / 3;

    // divisórias
    draw(C.cinzaLinha);
    doc.setLineWidth(0.3);
    doc.line(MX + T3,     Y+3, MX + T3,     Y+TOT_H-3);
    doc.line(MX + T3*2,   Y+3, MX + T3*2,   Y+TOT_H-3);

    // ── seção 1 — carrinho + valor total ──
    drawCart(MX + 10, Y + TOT_H/2, 7.5);
    doc.setFont("helvetica","bold");
    doc.setFontSize(7.5);
    rgb(C.azulMedio);
    doc.text("VALOR TOTAL:", MX+21, Y+9);
    doc.setFont("helvetica","bold");
    doc.setFontSize(15);
    rgb(C.azulMedio);
    doc.text(fmtMoeda(cotacao.valorTotal), MX+21, Y+19.5);

    // ── seção 2 — check + validade ──
    const S2X = MX + T3 + 6;
    drawCheck(S2X + 6, Y + TOT_H/2, 5.5);
    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("VALIDO ATÉ", S2X+15, Y+9.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text(validadeTexto.toUpperCase(), S2X+15, Y+17);

    // ── seção 3 — pin + cidade/data ──
    const S3X = MX + T3*2 + 6;
    drawPin(S3X + 6, Y + TOT_H/2 - 1, 5.5);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    rgb(C.pretoTexto);
    doc.text("LUZIÂNIA/GO", S3X+15, Y+9.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    rgb(C.cinzaTexto);
    doc.text(`${dia} DE ${MESES[parseInt(mes)]} DE ${ano}`, S3X+15, Y+17);

    Y += TOT_H + 6;

    // ══════════════════════════════════════════════════════
    // 6. OBSERVAÇÕES
    // ══════════════════════════════════════════════════════
    if (cotacao.observacoes) {
      if (Y + 22 > 272) { doc.addPage(); Y = 16; }

      const linhasObs = doc.splitTextToSize((cotacao.observacoes||"").toUpperCase(), CW - 22);
      const OBS_H = Math.max(18, 10 + linhasObs.length * 4.5);

      fill(C.cinzaFundo);
      draw(C.cinzaLinha);
      doc.setLineWidth(0.4);
      doc.roundedRect(MX, Y, CW, OBS_H, 2, 2, "FD");

      drawDoc(MX+3, Y + OBS_H/2 - 6, 9, 12);

      doc.setFont("helvetica","bold");
      doc.setFontSize(7.5);
      rgb(C.azulMedio);
      doc.text("OBSERVAÇÕES", MX+16, Y+7);

      doc.setFont("helvetica","normal");
      doc.setFontSize(8.5);
      rgb(C.pretoTexto);
      doc.text(linhasObs, MX+16, Y+13);
      Y += OBS_H + 6;
    }

    // ══════════════════════════════════════════════════════
    // 7. RODAPÉ
    // ══════════════════════════════════════════════════════
    const ROD_H = 18;
    const ROD_Y = 297 - ROD_H;

    gradRect(0, ROD_Y, PW, ROD_H, [8, 28, 95], [18, 65, 155]);

    // divisórias verticais
    doc.setDrawColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.3 }));
    doc.setLineWidth(0.3);
    doc.line(PW/3,     ROD_Y+3, PW/3,     ROD_Y+ROD_H-3);
    doc.line(PW/3*2,   ROD_Y+3, PW/3*2,   ROD_Y+ROD_H-3);
    doc.setGState(doc.GState({ opacity: 1 }));

    // slogan
    doc.setFont("helvetica","bolditalic");
    doc.setFontSize(10.5);
    rgb(C.branco);
    doc.text("Obrigado pela preferência!", PW/6, ROD_Y + 10.5, { align:"center" });

    // instagram
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(170, 205, 255);
    doc.text("@papelariafuturacentro", PW/2, ROD_Y + 10.5, { align:"center" });

    // whatsapp
    doc.text("(61) 99918-4452", PW/6*5, ROD_Y + 10.5, { align:"center" });

    // ── paginação ──
    const totalPags = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPags; p++) {
      doc.setPage(p);
      doc.setFont("helvetica","normal");
      doc.setFontSize(6);
      doc.setTextColor(130, 165, 220);
      doc.text(`Página ${p} de ${totalPags}`, PW - MX, ROD_Y + ROD_H - 2, { align:"right" });
    }

    // ── download ──
    doc.save(`Cotacao_${sanitize(cotacao.cliente)}_${new Date().toISOString().split("T")[0]}.pdf`);
    window.mostrarToast?.("PDF gerado com sucesso!", "success");

  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    window.mostrarToast?.("Erro ao gerar PDF. Tente novamente.", "error");
  }
}
