// Cálculos del N.º 9 con las tablas 8.1.1 / 8.1.2 (B.02, 2024) y 1.4.9 (B.01, 2024)
const dpT={};const raw="1.0 800 .83 273 .66 117 .49 -7 .32 -133 .15 -296 .99 677 .82 262 .65 110 .48 -14 .31 -141 .14 -309 .98 589 .81 251 .64 102 .47 -21 .30 -149 .13 -322 .97 538 .80 240 .63 95 .46 -29 .29 -158 .12 -336 .96 501 .79 230 .62 87 .45 -36 .28 -166 .11 -351 .95 470 .78 220 .61 80 .44 -43 .27 -175 .10 -366 .94 444 .77 211 .60 72 .43 -50 .26 -184 .09 -383 .93 422 .76 202 .59 65 .42 -57 .25 -193 .08 -401 .92 401 .75 193 .58 57 .41 -65 .24 -202 .07 -422 .91 383 .74 184 .57 50 .40 -72 .23 -211 .06 -444 .90 366 .73 175 .56 43 .39 -80 .22 -220 .05 -470 .89 351 .72 166 .55 36 .38 -87 .21 -230 .04 -501 .88 336 .71 158 .54 29 .37 -95 .20 -240 .03 -538 .87 322 .70 149 .53 21 .36 -102 .19 -251 .02 -589 .86 309 .69 141 .52 14 .35 -110 .18 -262 .01 -677 .85 296 .68 133 .51 7 .34 -117 .17 -273 .00 -800 .84 284 .67 125 .50 0 .33 -125 .16 -284".split(" ");
for(let i=0;i<raw.length;i+=2)dpT[Math.round(parseFloat(raw[i])*100)]=+raw[i+1];
const pdRaw="0-3 .50 92-98 .63 198-206 .76 345-357 .89 4-10 .51 99-106 .64 207-215 .77 358-374 .90 11-17 .52 107-113 .65 216-225 .78 375-391 .91 18-25 .53 114-121 .66 226-235 .79 392-411 .92 26-32 .54 122-129 .67 236-245 .80 412-432 .93 33-39 .55 130-137 .68 246-256 .81 433-456 .94 40-46 .56 138-145 .69 257-267 .82 457-484 .95 47-53 .57 146-153 .70 268-278 .83 485-517 .96 54-61 .58 154-162 .71 279-290 .84 518-559 .97 62-68 .59 163-170 .72 291-302 .85 560-619 .98 69-76 .60 171-179 .73 303-315 .86 620-735 .99 77-83 .61 180-188 .74 316-328 .87 84-91 .62 189-197 .75 329-344 .88".split(" ");
const pdT=[];for(let i=0;i<pdRaw.length;i+=2){const [a,b]=pdRaw[i].split("-").map(Number);pdT.push([a,b,+pdRaw[i+1]]);}
function PD(D){const a=Math.abs(D);let h=1.0;for(const [x,y,v] of pdT) if(a>=x&&a<=y)h=v; if(a>735)h=1.0; return D>=0?h:+(1-h).toFixed(2);}
const dp=p=>dpT[Math.round(p*100+1e-9)];
// 1) rating inicial
const g=[[3,2220,1],[5,2150,3],[4,2200,2.5]];
let n=0,s=0,sum=0;for(const [k,r,pt] of g){n+=k;s+=pt;sum+=k*r;}
console.log("ORIGINAL 2013: n",n,"pts",s,"prom",sum/n);
const n2=n+2,s2=s+1,Ra=(sum+3600)/n2,p=s2/n2;console.log("2024: n",n2,"pts",s2,"Ra",Ra.toFixed(2),"p",p.toFixed(4),"dp",dp(p),"Ru",Math.round(Ra+dp(p)));
// variante: un solo torneo de 5 partidas
{const ops=[1950,1720,1610,1880,1540],res=[0,1,0.5,0.5,1];const sumo=ops.reduce((a,b)=>a+b,0)+3600,N=ops.length+2,S=res.reduce((a,b)=>a+b,0)+1;const ra=sumo/N,pp=S/N;console.log("ini5: rated avg",ops.reduce((a,b)=>a+b,0)/5,"Ra",ra.toFixed(2),"p",pp.toFixed(4),"dp",dp(pp),"Ru",Math.round(ra+dp(pp)));}
// 2) cambio de rating
function cambio(R,K,ops,res){let t=0;const rows=[];ops.forEach((o,i)=>{let D=R-o;const Dc=(R<2650&&Math.abs(D)>400)?Math.sign(D)*400:D;const pd=PD(Dc);const dr=res[i]-pd;t+=dr;rows.push([o,D,Dc,pd,res[i],+dr.toFixed(2)]);});return {rows,sum:+t.toFixed(2),change:K*t,rounded:Math.sign(K*t)*Math.round(Math.abs(K*t))};}
const ops=[2050,1700,1300,1920,1810],res=[0.5,1,1,0,0.5];
console.log("adulto K20",JSON.stringify(cambio(1850,20,ops,res)));
console.log("junior K40",JSON.stringify(cambio(1850,40,ops,res)));
// 3) norma GM
const opp=[["GM",2610],["GM",2555],["IM",2480],["GM",2390],["IM",2450],["FM",2302],["GM",2520],["FM",2180],["IM",2410]];
const rs=opp.map(o=>o[1]);const low=Math.min(...rs);const adj=rs.map(r=>r===low&&r<2200?2200:r);
const avg=adj.reduce((a,b)=>a+b,0)/adj.length;console.log("norma: suma",adj.reduce((a,b)=>a+b,0),"avg",avg,"redondeo",Math.round(avg));
for(const pts of [6,6.5,7]){const pr=Math.round(pts/9*100)/100;console.log(pts,"p",pr,"dp",dp(pr),"Rp",Math.round(avg)+dp(pr));}
// sin piso
const avg0=rs.reduce((a,b)=>a+b,0)/9;console.log("sin piso avg",avg0, Math.round(avg0));

/*! rev bfb5bbb0d2d82f9f */
