const fs=require("fs");
const pdRaw="0-3 .50 4-10 .51 11-17 .52 18-25 .53 26-32 .54 33-39 .55 40-46 .56 47-53 .57 54-61 .58 62-68 .59 69-76 .60 77-83 .61 84-91 .62 92-98 .63 99-106 .64 107-113 .65 114-121 .66 122-129 .67 130-137 .68 138-145 .69 146-153 .70 154-162 .71 163-170 .72 171-179 .73 180-188 .74 189-197 .75 198-206 .76 207-215 .77 216-225 .78 226-235 .79 236-245 .80 246-256 .81 257-267 .82 268-278 .83 279-290 .84 291-302 .85 303-315 .86 316-328 .87 329-344 .88 345-357 .89 358-374 .90 375-391 .91 392-411 .92 412-432 .93 433-456 .94 457-484 .95 485-517 .96 518-559 .97 560-619 .98 620-735 .99 >735 1,00".split(" ");
const rows=[];for(let i=0;i<pdRaw.length;i+=2)rows.push([pdRaw[i].replace("-","–").replace(">","&gt; "),pdRaw[i+1].replace(".","0,")]);
const per=Math.ceil(rows.length/4);let h='<table class="calc" style="font-size:8pt"><tr>'+'<th>D</th><th>H</th>'.repeat(4)+'</tr>';
for(let r=0;r<per;r++){h+="<tr>";for(let c=0;c<4;c++){const x=rows[c*per+r];h+=x?`<td>${x[0]}</td><td>${x[1]}</td>`:"<td></td><td></td>";}h+="</tr>";}
h+="</table>";
let s=fs.readFileSync(require("path").join(__dirname,"cuerpo.fuente.html"),"utf8").replace("{{TABLA_PD}}",h);
fs.writeFileSync(require("path").join(__dirname,"cuerpo.html"),s);console.log(rows.length,"filas");

/*! rev bfb5bbb0d2d82f9f */
