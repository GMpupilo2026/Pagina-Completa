/* Las planillas de verdad que se usan para probar js/planilla-reconstruir.js:
 * lo escrito en cada planilla de tres mesas de la ronda 4 del Centroamericano
 * 2026 (las fotos del Drive), transcrito tal cual, con sus errores. Solo las
 * jugadas: sin nombres. Lo usan verificar-planilla-reconstruir.js y
 * verificar-leer-partida.js.
 *
 *  - mesa11: las dos planillas en español. La de negras anotó 16. The1 The8
 *    (fue Thf1 Thf8): desde ahí, leída sola, ya no es la partida.
 *  - mesa7: una en inglés con «P» de peón (como se anota en el Caribe) y otra
 *    en español; no coinciden en varias jugadas (15: «Pf5» y «f4»).
 *  - mesa5: lo escrito en una planilla en inglés (1–40) y otra en español
 *    (41–53), con «Nd2» ambiguo y «Kg4» por «Ng4». */
"use strict";
module.exports = {
    mesa11: { blancas: ["e4","c6","d4","d5","e5","Af5","h4","h6","Ad3","Axd3","Dxd3","e6","Ae3","Cd7","Cd2","Db6","Cgf3","Ce7","Db3","Cf5","g4","Cxe3","fxe3","Ae7","Dxb6","Cxb6","0-0-0","0-0-0","h5","g5","Thf1","Thf8","Ch2","Td7","Tf3","Ad8","Tdf1","f6","exf6","Tdf7","Cb3","Cd7","Rd2","b6","Re2","Txf6","Txf6","Txf6","Txf6","Axf6","Cf3","Rc7"], negras: ["e4","c6","d4","d5","e5","Af5","h4","h6","Ad3","Axd3","Dxd3","e6","Ae3","Cd7","Cd2","Db6","Cgf3","Ce7","Db3","Cf5","g4","Cxe3","fxe3","Ae7","Dxb6","Cxb6","0-0-0","0-0-0","h5","g5","The1","The8","Ch2","Td7","Tf3","Ad8","Tdf1","f6","exf6","Tdf7","Cb3","Cd7","Rd2","b6","Re2","Txf6","Txf6","Txf6","Txf6","Axf6","Cf3","Rc7"] },
    mesa7: { blancas: ["Pe4","Pd6","Pd4","Pg6","Nf3","Bg4","Ph3","Bxf3","Qxf3","Bg7","Be3","Nf6","Nc3","Nd6","Bc4","Pe5","Pd5","Pa6","Pa4","O-O","O-O","Ne8","Qg3","Nf6","Qh2","Nb6","Bb3","Pa5","Pf5","Pxf5","Qxf5","Nd7","Rf2","Qe7","Qh4","Re8","Bg5","Qe5","Re2","Nc5","Bxf6","Bxf6","Rxf6","Kg7","Rf4+","Pg5","Qg3","Qxf4","Qxf4","Pxf4","Bd3","Re7","Kf2","Kg6","Pg3","Pxg3","Kxg3","Re5","Rf4","Pf5","Rg6","Kf6","Rg5","Pxe4","Rxe5","Pxe5","Ke4","Kf5","Ne2","Kg5","Nc3","Rf3","Ke2","Rxh3","Nb5","Pc6","Pxc6","Pxc6","Nd6","Nxa4","Nxe4","Kf4","Pb3","Nc3","Nxc3","Rxc3","Kd2","Rg3","Pc3","Ph5","Ke1","Ph4"], negras: ["e4","d6","d4","g6","Cf3","Ag4","h3","Axf3","Dxf3","Ag7","Ae3","Cf6","Cc3","Cd7","Ac4","e5","d5","a6","a4","O-O","O-O","Ce8","Dg3","Cf6","Dh2","Cb6","Ab3","a5","f4","exf4","Dxf4","Cd7","Tf2","De7","Dh4","Tae8","Ag5","Db6","Tae1","Cc5","Axf6","Axf6","Txf6","Rg7","Tf7","g5","Dg3","Dxf4","Df4","gxf4","Ad2","Te7","Rf2","Rg6","g3","fxg3","Rxg3","Te5","Rf4","f5","Tg1","Rf6","Tg5","fxe4","Txe5","dxe5","Re3","Rf5","Ce2","Rg5","Cc3","Tf3","Re2","Txh3","Cb5","c6","dxc5","bxc5","Cd6","Cxa4","Cxe4","Rf4","b3","Cc3","Cxc3","Txc3","Rd2","Tg3","c3","h5","Re1","h4"] },
    mesa5: { una: ["e4","c6","d4","d5","e5","c5","c3","Nc6","Be2","cxd4","cxd4","Bf5","Nf3","e6","O-O","Bg4","Nd2","Ne7","h3","Bxf3","Nxf3","Nf5","b3","h5","Bg5","Qb6","Rc1","Ba3","Rb1","Nxd4","Nxd4","Qxd4","Bxh5","Qxe5","h4","Be7","Re1","Qd6","Qg4","e5","Qe2","g6","Bg4","f6","Bd2","f5","Bh3","Rxh4","Qb5","O-O-O","Rc1","Kb8","Rc3","Re4","R3c1","Rh8","Rxe4","fxe4","Bg4","a6","Qa4","Qf6","Rc2","Qh5","Bh3","Nd4","Rb2","Bc5","Be1","Nf3+","Kf1","Nh2+","Ke1","Kg4","b4","Bd4","Re2","Nxf2","Kd2","Nxh3","gxh3","Dg5+","Rd1","Dg1+","Te1","Df2","Db3","Td8","Ad2","Df3+","Dxf3","gxf3","Tf1","e4","Af4+","Ra8","Re2","b6","Tb1","Tc3","Re1","e3","Td1","f2+","Rf1","Tc2"] },
};

/*! rev bfb5bbb0d2d82f9f */
