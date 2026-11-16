const T=["GM","IM","WGM","FM","WIM","CM","WFM","WCM",""];
const L=[["Rojas Mena, Andrés","FM",2215],["Quesada Ulate, Sofía","WIM",2215],["Brenes Mora, Luis","CM",2215],["Arias Solano, Pablo","",2215],
["Vargas Pérez, Daniela","WFM",2140],["Castro León, Mario","CM",2140],["Mora Jiménez, Ana","WCM",2140],
["Solís Rojas, Diego","",1980],["Alfaro Brenes, Diego","",1980],["Herrera Gómez, Tomás","FM",2302],["Chaves Mena, Laura","",0],["Umaña Ruiz, Felipe","",0]];
const s=[...L].sort((a,b)=>b[2]-a[2]||T.indexOf(a[1])-T.indexOf(b[1])||a[0].localeCompare(b[0],"es"));
s.forEach((x,i)=>console.log(i+1,x.join(" | ")));
const T13=["GM","IM","WGM","WIM","FM","CM","WFM","WCM",""];
console.log("--- orden de 2013");[...L].sort((a,b)=>b[2]-a[2]||T13.indexOf(a[1])-T13.indexOf(b[1])||a[0].localeCompare(b[0],"es")).forEach((x,i)=>console.log(i+1,x.join(" | ")));

/*! rev bfb5bbb0d2d82f9f */
