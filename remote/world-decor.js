'use strict';

(() => {
  const dark='#433328', wood='#9f724b', gold='#c6a471', iron='#777b74', bone='#d6c6a4';
  function polygon(ctx, points, color) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
  }
  function line(ctx, points, color, width=.025) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.lineCap='round';
    ctx.strokeStyle=color;
    ctx.lineWidth=width;
    ctx.stroke();
  }
  function oval(ctx,x,y,w,h,color) {
    ctx.beginPath();
    ctx.ellipse(x,y,w,h,0,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
  }
  function boards(ctx,x,y,w,h,n) {
    ctx.fillStyle='#29261d66';ctx.fillRect(x+.022,y+.041,w,h);
    ctx.fillStyle=dark;ctx.fillRect(x,y,w,h);
    for(let i=0;i<n;i++) {
      const row=y+.026+i*(h-.052)/n;
      ctx.fillStyle=[wood,'#ad7e51','#8b6444'][i%3];
      ctx.fillRect(x+.018,row,w-.036,(h-.052)/n-.012);
      line(ctx,[[x+w*.13,row+.022],[x+w*.40,row+.025],[x+w*.62,row+.016]],'#e1b87960',.012);
      oval(ctx,x+w*.08,row+.021,.009,.011,dark);
      oval(ctx,x+w*.91,row+.021,.009,.011,dark);
    }
  }
  function fire(ctx,x,y,s=1,smoke=true) {
    ctx.save();
    ctx.translate(x,y);ctx.scale(s,s);
    if(smoke) {
      oval(ctx,.16,-.29,.12,.08,'#ada39448');
      oval(ctx,.09,-.21,.10,.062,'#a49b8b58');
    }
    polygon(ctx,[[-.20,.12],[-.24,.02],[-.18,-.06],[-.15,-.19],[-.06,-.09],[.035,-.29],
      [.10,-.15],[.11,-.04],[.21,-.11],[.23,.025],[.16,.13]],'#8d452b');
    polygon(ctx,[[-.17,.095],[-.18,.001],[-.11,-.11],[-.05,-.035],[.031,-.23],
      [.077,-.10],[.095,.025],[.175,-.058],[.184,.052],[.12,.11]],'#e68a3d');
    polygon(ctx,[[-.10,.09],[-.095,.016],[-.027,.034],[.027,-.135],[.066,-.003],
      [.115,.034],[.092,.105]],'#f5cb73');
    ctx.restore();
  }
  function wheel(ctx,x,y,broken=false) {
    oval(ctx,x,y,.080,.10,dark);
    oval(ctx,x,y,.062,.078,'#be925f');
    oval(ctx,x,y,.049,.061,'#51402e');
    for(let i=0;i<(broken?5:8);i++){
      const a=i*Math.PI/4;
      line(ctx,[[x,y],[x+Math.cos(a)*.060,y+Math.sin(a)*.075]],gold,.012);
    }
    if(broken)polygon(ctx,[[x+.01,y+.02],[x+.09,y+.10],[x-.02,y+.11]],'#423328');
    oval(ctx,x,y,.015,.021,iron);
  }
  function wagon(ctx, variant) {
    const broken=variant==='wreckedWagon', covered=variant!=='cart';
    ctx.save();
    if(broken){ctx.translate(-.025,.042);ctx.rotate(-.13);}
    line(ctx,[[.22,-.07],[.46,-.035],[.46,.045],[.22,.076]],dark,.040);
    line(ctx,[[.25,-.07],[.46,-.035]],gold,.013);
    boards(ctx,-.38,-.25,.65,.50,6);
    for(const y of [-.30,.30])for(const x of [-.26,.16])wheel(ctx,x,y,broken&&x>.0&&y>.0);
    if(covered){
      polygon(ctx,[[-.36,-.22],[-.25,-.31],[.09,-.29],[.24,-.21],[.25,.19],
        [.09,.28],[-.26,.29],[-.36,.21]],'#726956');
      polygon(ctx,[[-.34,-.19],[-.24,-.28],[.09,-.26],[.22,-.18],[.21,.16],
        [.05,.24],[-.27,.25],[-.34,.18]],'#d6c39c');
      for(const x of [-.23,-.05,.13]){
        line(ctx,[[x,-.24],[x-.024,-.075],[x-.018,.084],[x,.22]],'#98825f',.019);
        line(ctx,[[x+.025,-.23],[x+.018,-.11],[x+.029,.068]],'#f0dfb7',.015);
      }
      if(broken){
        polygon(ctx,[[-.19,.26],[-.12,.14],[-.07,.20],[-.05,.10],[.03,.16],[.10,.07],[.17,.22],[.04,.28]],dark);
        polygon(ctx,[[.08,-.27],[.11,-.11],[.16,-.17],[.19,-.10],[.23,-.22]],'#514135');
      }
    }
    ctx.restore();
    if(broken)for(let i=0;i<5;i++)line(ctx,[[.19+i*.046,.27+i*.023],[.23+i*.05,.35+i*.018]],i%2?gold:wood,.023);
  }
  function barrel(ctx, fancy) {
    oval(ctx,.045,.092,.34,.32,'#33271e55');
    oval(ctx,0,0,.33,.36,dark);
    oval(ctx,0,-.018,.293,.326,fancy?'#a87b49':'#926541');
    for(let i=-2;i<=2;i++){
      const x=i*.093;
      line(ctx,[[x,-.30],[x*1.14,-.06],[x*1.09,.12],[x,.30]],'#684b35',.018);
    }
    for(const y of [-.22,.22]){
      line(ctx,[[-.265,y],[-.13,y+.034],[.12,y+.036],[.267,y]],'#494841',.060);
      line(ctx,[[-.248,y-.018],[-.12,y+.014],[.11,y+.017],[.249,y-.016]],iron,.019);
    }
    if(fancy){
      const vine=[[-.22,.14],[-.14,.052],[-.04,.075],[.04,-.012],[.14,-.068],[.22,-.05]];
      line(ctx,vine,'#e1b778',.027);
      for(const [x,y] of vine.slice(1,-1)) {
        polygon(ctx,[[x,y],[x-.07,y-.015],[x-.088,y-.085],[x-.014,y-.069]],'#697546');
      }
      for(const [x,y] of [[.09,.057],[.148,.062],[.122,.106],[.157,.132]])oval(ctx,x,y,.026,.026,'#805363');
    }
  }
  function chest(ctx,open) {
    boards(ctx,-.37,-.23,.74,.51,5);
    if(open){
      polygon(ctx,[[-.35,-.21],[.35,-.21],[.28,-.37],[-.28,-.37]],'#764f35');
      polygon(ctx,[[-.30,-.20],[.30,-.20],[.27,-.055],[-.27,-.055]],'#483529');
      for(const x of [-.17,-.09,.035,.12,.16])oval(ctx,x,-.11+Math.sin(x*18)*.03,.032,.021,'#d5ae5c');
    }
    for(const x of [-.31,.25]){
      ctx.fillStyle='#494843';ctx.fillRect(x,-.22,.066,.48);
      ctx.fillStyle=iron;ctx.fillRect(x+.013,-.19,.025,.41);
      for(const y of [-.155,.17])oval(ctx,x+.032,y,.015,.016,'#c4b79b');
    }
    ctx.fillStyle='#d1ad69';ctx.fillRect(-.064,.098,.128,.14);
    oval(ctx,0,.17,.021,.036,dark);
  }
  function skull(ctx,x,y,s=1) {
    oval(ctx,x,y,.106*s,.09*s,bone);
    polygon(ctx,[[x-.06*s,y+.04*s],[x+.059*s,y+.04*s],[x+.042*s,y+.13*s],[x-.041*s,y+.13*s]],bone);
    for(const dx of [-.039,.039])oval(ctx,x+dx*s,y+.015*s,.022*s,.024*s,dark);
    oval(ctx,x,y+.06*s,.014*s,.017*s,dark);
  }
  function pumpkin(ctx, scale) {
    ctx.save();
    ctx.scale(scale,scale);
    oval(ctx,.045,.082,.33,.25,'#543c2759');
    oval(ctx,0,0,.32,.27,'#79472c');
    for(let i=-2;i<=2;i++)oval(ctx,i*.092,-.012,.12,.233-Math.abs(i)*.021,
      ['#aa592f','#c37338','#d38b45','#b26332','#a4542c'][i+2]);
    line(ctx,[[0,-.038],[.057,-.12],[.027,-.179]],'#647047',.053);
    ctx.restore();
  }
  const paint = {
    wagon: ctx=>wagon(ctx,'wagon'),
    wreckedWagon: ctx=>wagon(ctx,'wreckedWagon'),
    campfire(ctx) {
      for(let i=0;i<10;i++){
        const a=i*Math.PI/5;
        oval(ctx,Math.cos(a)*.31,Math.sin(a)*.26,.056,.043,i%2?'#939182':'#716e62');
      }
      line(ctx,[[-.25,.17],[.22,-.13]],dark,.112);line(ctx,[[-.23,-.12],[.24,.19]],wood,.095);
      oval(ctx,-.23,-.12,.052,.047,gold);oval(ctx,.24,.19,.054,.047,gold);
      fire(ctx,0,.02,1);
    },
    barrel: ctx=>barrel(ctx,false),
    vineBarrel: ctx=>barrel(ctx,true),
    chest: ctx=>chest(ctx,false),
    openChest: ctx=>chest(ctx,true),
    palisade(ctx) {
      line(ctx,[[-.5,.08],[.5,.08]],dark,.14);
      for(let i=0;i<8;i++){
        const x=-.5+i/8;
        polygon(ctx,[[x+.012,.18],[x+.010,-.11],[x+.060,-.32+(i%3)*.04],
          [x+.113,-.105],[x+.113,.18]],i%2?'#ad8459':'#8f6947');
        line(ctx,[[x+.042,.13],[x+.04,-.073],[x+.061,-.18]],'#d1a977',.014);
      }
    },
    ruinedHouse(ctx) {
      polygon(ctx,[[-.42,-.35],[.39,-.35],[.45,.23],[.27,.35],[-.42,.33]],'#685341');
      for(const wall of [[[-.44,.28],[-.45,-.36],[-.06,-.36]],[[.15,-.37],[.43,-.38],[.43,-.03]],[[.04,.36],[.31,.36],[.42,.22]]]){
        line(ctx,wall,'#382f26',.09);line(ctx,wall,'#825a3d',.045);
      }
      for(let i=0;i<12;i++){
        const x=((i*23)%61)/100-.31, y=((i*19)%48)/100-.23;
        line(ctx,[[x,y],[x+.11,y+((i%3)-1)*.09]],i%3?'#997553':'#413429',.026);
      }
      line(ctx,[[-.42,-.25],[-.18,-.02]],'#463528',.079);
      line(ctx,[[.36,-.28],[.15,.09]],'#4f3c2b',.064);
    },
    table(ctx) {
      for(const x of [-.34,.34])for(const y of [-.24,.24])oval(ctx,x,y,.06,.06,dark);
      boards(ctx,-.44,-.22,.88,.44,4);
    },
    bench(ctx) {
      for(const x of [-.35,.35])line(ctx,[[x,-.12],[x,.14]],dark,.082);
      boards(ctx,-.43,-.095,.86,.19,2);
    },
    bearTrap(ctx) {
      oval(ctx,0,0,.33,.28,dark);
      oval(ctx,0,0,.288,.242,iron);
      oval(ctx,0,0,.23,.175,'#4d4b40');
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8;
        const point=(r,t)=>[Math.cos(a+t)*r,Math.sin(a+t)*r*.85];
        polygon(ctx,[point(.277,-.13),point(.27,.13),point(.161,0)],'#c2beab');
      }
      ctx.fillStyle='#8f8a77';ctx.fillRect(-.11,-.077,.22,.154);
      line(ctx,[[.29,.10],[.36,.20],[.39,.30]],'#a6a292',.037);
    },
    brazier(ctx) {
      for(const [x,y] of [[-.34,.20],[.32,.22],[0,-.34]])line(ctx,[[0,0],[x,y]],dark,.072);
      oval(ctx,0,0,.29,.234,'#41433b');oval(ctx,0,-.025,.245,.18,iron);oval(ctx,0,-.018,.200,.14,'#643a29');
      for(const x of [-.13,-.05,.06,.15])oval(ctx,x,.025,.032,.022,'#de8849');
      fire(ctx,.017,.04,.64,false);
    },
    goblinTotems(ctx) {
      for(const [x,y] of [[-.29,-.23],[.29,-.23],[-.28,.29],[.29,.29]])line(ctx,[[0,0],[x,y]],wood,.049);
      line(ctx,[[-.33,.16],[.32,-.12]],dark,.067);
      for(const [x,y] of [[-.20,-.14],[.03,-.045],[.24,-.13]])skull(ctx,x,y,.75);
      for(const [x,y,c] of [[-.25,.05,'#a34d42'],[.14,.04,'#5e7557'],[.30,-.02,'#ae6d46']]){
        polygon(ctx,[[x,y],[x+.075,y+.01],[x+.036,y+.19],[x-.032,y+.15]],c);
        line(ctx,[[x,y],[x+.006,y+.12]],gold,.013);
      }
    },
    well(ctx) {
      oval(ctx,.037,.067,.36,.34,'#292a2358');
      oval(ctx,0,0,.34,.33,'#454740');
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        oval(ctx,Math.cos(a)*.269,Math.sin(a)*.259,.069,.062,i%2?'#969284':'#817e71');
      }
      oval(ctx,0,0,.214,.203,'#344d4b');
      line(ctx,[[-.324,-.24],[-.324,.25]],wood,.053);
      line(ctx,[[.324,-.24],[.324,.25]],wood,.053);
      line(ctx,[[-.362,-.10],[.365,-.10]],dark,.057);
      line(ctx,[[-.04,-.10],[.016,-.025],[.016,.074]],gold,.024);
      oval(ctx,.016,.084,.052,.041,'#b39161');
    },
    cart: ctx=>wagon(ctx,'cart'),
    pole(ctx) {
      polygon(ctx,[[.014,.056],[.332,.31],[.275,.38],[-.046,.081]],'#2b2c265d');
      oval(ctx,0,.04,.17,.15,'#74583d');
      oval(ctx,0,.01,.124,.109,'#b58a5c');
      oval(ctx,-.017,-.013,.074,.063,'#c8a16c');
      line(ctx,[[-.049,.014],[.01,-.031],[.037,.007]],'#755739',.021);
    },
    pumpkin: ctx=>pumpkin(ctx,1),
    smallPumpkin: ctx=>pumpkin(ctx,.62),
    greatsword(ctx) {
      polygon(ctx,[[-.03,-.084],[.29,-.075],[.46,-.003],[.29,.083],[-.03,.084]],'#7f7263');
      polygon(ctx,[[-.02,-.057],[.30,-.049],[.432,-.003],[.271,.023],[-.02,.038]],'#b7a991');
      for(const x of [.06,.16,.28])oval(ctx,x,x%2*.15,.024,.021,'#9d6145');
      line(ctx,[[-.06,-.15],[-.052,.157]],'#62513d',.047);
      line(ctx,[[-.365,.003],[-.075,.003]],'#604532',.058);
      for(let i=0;i<6;i++)line(ctx,[[-.33+i*.04,-.021],[-.316+i*.04,.025]],gold,.014);
      oval(ctx,-.365,0,.044,.044,'#8d7859');
    },
    burningRoof(ctx) {
      for(const [x,y,s] of [[-.23,.09,.74],[.03,-.05,1.1],[.25,.16,.72],[.12,.28,.61]]) {
        oval(ctx,x,y,.14,.11,'#45322c69');
        fire(ctx,x,y,s);
      }
    },
    debris(ctx) {
      for(let i=0;i<14;i++){
        const x=((i*17)%67)/100-.36,y=((i*29)%66)/100-.35;
        polygon(ctx,[[x,y],[x+.14,y+.034*(i%3-1)],[x+.09,y+.08],[x-.025,y+.028]],i%3?wood:'#635347');
      }
    },
    fence(ctx) {
      for(const y of [-.047,.077])line(ctx,[[-.5,y],[.5,y]],dark,.055);
      for(let i=0;i<7;i++){
        const x=-.47+i*.14;
        polygon(ctx,[[x,-.12],[x+.055,-.21],[x+.095,-.12],[x+.094,.17],[x,.17]],i%2?wood:'#a37d56');
        oval(ctx,x+.045,.067,.008,.015,dark);
      }
    },
    bones(ctx) {
      for(const [x,y,a] of [[-.22,.14,.38],[.13,.11,-.16],[.04,-.13,.81],[-.14,.23,-.14]]) {
        line(ctx,[[x,y],[x+.23,y+a*.22]],bone,.047);
        oval(ctx,x,y,.044,.026,bone);oval(ctx,x+.23,y+a*.22,.041,.029,bone);
      }
      skull(ctx,-.16,-.14,.84);
    },
    boulder(ctx) {
      polygon(ctx,[[-.40,.19],[-.38,-.12],[-.19,-.32],[.14,-.34],[.39,-.09],[.36,.23],[.13,.35],[-.22,.32]],'#57564b');
      polygon(ctx,[[-.34,-.10],[-.17,-.27],[.12,-.29],[.31,-.08],[.13,.092],[-.18,.12]],'#929184');
      polygon(ctx,[[-.18,.12],[.13,.092],[.31,-.08],[.30,.21],[.11,.28],[-.21,.25]],'#717064');
      line(ctx,[[-.20,-.17],[-.06,-.24],[.10,-.233]],'#b9b3a2',.018);
    },
    torch(ctx) {
      polygon(ctx,[[-.083,.24],[.083,.24],[.055,.37],[-.06,.37]],iron);
      line(ctx,[[0,.32],[.02,-.045]],wood,.072);
      fire(ctx,.02,-.055,.66,false);
    },
    garland(ctx) {
      const points=Array.from({length:9},(_,i)=>[-.47+i*.1175,-.18+.23*Math.sin(i*Math.PI/8)]);
      line(ctx,points,'#604c32',.024);
      points.slice(1,-1).forEach(([x,y],i)=>polygon(ctx,[[x-.026,y],[x+.047,y+.01],[x+.014,y+.22]],
        ['#a55a49','#bba061','#738252','#63807c'][i%4]));
    },
  };
  window.WorldDecor = { paint };
})();
