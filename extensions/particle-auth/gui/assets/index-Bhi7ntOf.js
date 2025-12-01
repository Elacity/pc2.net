import{r as i,be as ve,bb as j,aI as F,b9 as J,bd as Ye,bf as q,c3 as yi,cz as wi,o as hn,bC as Ra,bk as Xn,ba as M,bp as Ci,bg as yn,bI as _r,aH as Si,dh as Pa,c6 as Ei,bu as Ze,bj as _e,bc as Ii,c0 as Ri,bD as Ta,bE as ka,b8 as Na,b7 as Aa,bt as Pi,bV as Ti,bh as Oa,bz as Ma,bl as qa,bL as ja,di as yr,dj as ki,dk as Ka,dl as cn,dm as wr,dn as Cr,dp as qn,dq as La,dr as za,ds as jn,dt as Da,du as $a,aK as Sr,dv as Ba,aL as Ni,dw as Va,V as Ai,f as Fa,dx as Ua,dy as Wa,Z as Ga,dz as Ha,av as Ya,dA as $r,dB as Xa}from"./index-CaXbrBtJ.js";import{R as Gn,P as Za,b as Ja,u as _n,T as Oi,i as Qa}from"./colors-D_r1Oo9l.js";import{p as es,D as ns}from"./chunk-GKIRU5P2-B6ZqBHrn.js";import{r as ts}from"./index-BqT3UfUb.js";var rt,Br;function Mi(){if(Br)return rt;Br=1;function e(n,o){return function(r){return n(o(r))}}return rt=e,rt}var ot,Vr;function qi(){if(Vr)return ot;Vr=1;var e=Mi(),n=e(Object.getPrototypeOf,Object);return ot=n,ot}var rs=["prefixCls","invalidate","item","renderItem","responsive","responsiveDisabled","registerSize","itemKey","className","style","children","display","order","component"],pn=void 0;function os(e,n){var o=e.prefixCls,r=e.invalidate,t=e.item,s=e.renderItem,a=e.responsive,f=e.responsiveDisabled,l=e.registerSize,u=e.itemKey,d=e.className,p=e.style,b=e.children,w=e.display,x=e.order,S=e.component,E=S===void 0?"div":S,R=ve(e,rs),y=a&&!w;function C(v){l(u,v)}i.useEffect(function(){return function(){C(null)}},[]);var P=s&&t!==pn?s(t,{index:x}):b,g;r||(g={opacity:y?0:1,height:y?0:pn,overflowY:y?"hidden":pn,order:a?x:pn,pointerEvents:y?"none":pn,position:y?"absolute":pn});var c={};y&&(c["aria-hidden"]=!0);var _=i.createElement(E,j({className:J(!r&&o,d),style:F(F({},g),p)},c,R,{ref:n}),P);return a&&(_=i.createElement(Gn,{onResize:function(h){var I=h.offsetWidth;C(I)},disabled:f},_)),_}var On=i.forwardRef(os);On.displayName="Item";function is(e){if(typeof MessageChannel>"u")Ye(e);else{var n=new MessageChannel;n.port1.onmessage=function(){return e()},n.port2.postMessage(void 0)}}function as(){var e=i.useRef(null),n=function(r){e.current||(e.current=[],is(function(){wi.unstable_batchedUpdates(function(){e.current.forEach(function(t){t()}),e.current=null})})),e.current.push(r)};return n}function En(e,n){var o=i.useState(n),r=q(o,2),t=r[0],s=r[1],a=yi(function(f){e(function(){s(f)})});return[t,a]}var Hn=hn.createContext(null),ss=["component"],fs=["className"],ls=["className"],cs=function(n,o){var r=i.useContext(Hn);if(!r){var t=n.component,s=t===void 0?"div":t,a=ve(n,ss);return i.createElement(s,j({},a,{ref:o}))}var f=r.className,l=ve(r,fs),u=n.className,d=ve(n,ls);return i.createElement(Hn.Provider,{value:null},i.createElement(On,j({ref:o,className:J(f,u)},l,d)))},ji=i.forwardRef(cs);ji.displayName="RawItem";var us=["prefixCls","data","renderItem","renderRawItem","itemKey","itemWidth","ssr","style","className","maxCount","renderRest","renderRawRest","suffix","component","itemComponent","onVisibleChange"],Ki="responsive",Li="invalidate";function gs(e){return"+ ".concat(e.length," ...")}function ps(e,n){var o=e.prefixCls,r=o===void 0?"rc-overflow":o,t=e.data,s=t===void 0?[]:t,a=e.renderItem,f=e.renderRawItem,l=e.itemKey,u=e.itemWidth,d=u===void 0?10:u,p=e.ssr,b=e.style,w=e.className,x=e.maxCount,S=e.renderRest,E=e.renderRawRest,R=e.suffix,y=e.component,C=y===void 0?"div":y,P=e.itemComponent,g=e.onVisibleChange,c=ve(e,us),_=p==="full",v=as(),h=En(v,null),I=q(h,2),m=I[0],T=I[1],k=m||0,O=En(v,new Map),D=q(O,2),U=D[0],$=D[1],W=En(v,0),X=q(W,2),ge=X[0],re=X[1],N=En(v,0),A=q(N,2),K=A[0],G=A[1],be=En(v,0),ye=q(be,2),oe=ye[0],xe=ye[1],se=i.useState(null),H=q(se,2),Te=H[0],Ee=H[1],Ie=i.useState(null),V=q(Ie,2),z=V[0],L=V[1],ie=i.useMemo(function(){return z===null&&_?Number.MAX_SAFE_INTEGER:z||0},[z,m]),ke=i.useState(!1),Me=q(ke,2),he=Me[0],we=Me[1],ne="".concat(r,"-item"),Ne=Math.max(ge,K),Ae=x===Ki,ee=s.length&&Ae,Ke=x===Li,pe=ee||typeof x=="number"&&s.length>x,fe=i.useMemo(function(){var B=s;return ee?m===null&&_?B=s:B=s.slice(0,Math.min(s.length,k/d)):typeof x=="number"&&(B=s.slice(0,x)),B},[s,d,m,x,ee]),Re=i.useMemo(function(){return ee?s.slice(ie+1):s.slice(fe.length)},[s,fe,ee,ie]),de=i.useCallback(function(B,Z){var ce;return typeof l=="function"?l(B):(ce=l&&(B==null?void 0:B[l]))!==null&&ce!==void 0?ce:Z},[l]),Le=i.useCallback(a||function(B){return B},[a]);function le(B,Z,ce){z===B&&(Z===void 0||Z===Te)||(L(B),ce||(we(B<s.length-1),g==null||g(B)),Z!==void 0&&Ee(Z))}function ae(B,Z){T(Z.clientWidth)}function Se(B,Z){$(function(ce){var qe=new Map(ce);return Z===null?qe.delete(B):qe.set(B,Z),qe})}function tn(B,Z){G(Z),re(K)}function rn(B,Z){xe(Z)}function He(B){return U.get(de(fe[B],B))}Ra(function(){if(k&&typeof Ne=="number"&&fe){var B=oe,Z=fe.length,ce=Z-1;if(!Z){le(0,null);return}for(var qe=0;qe<Z;qe+=1){var Ue=He(qe);if(_&&(Ue=Ue||0),Ue===void 0){le(qe-1,void 0,!0);break}if(B+=Ue,ce===0&&B<=k||qe===ce-1&&B+He(ce)<=k){le(ce,null);break}else if(B+Ne>k){le(qe-1,B-Ue-oe+K);break}}R&&He(0)+oe>k&&Ee(null)}},[k,U,K,oe,de,fe]);var on=he&&!!Re.length,an={};Te!==null&&ee&&(an={position:"absolute",left:Te,top:0});var Be={prefixCls:ne,responsive:ee,component:P,invalidate:Ke},Je=f?function(B,Z){var ce=de(B,Z);return i.createElement(Hn.Provider,{key:ce,value:F(F({},Be),{},{order:Z,item:B,itemKey:ce,registerSize:Se,display:Z<=ie})},f(B,Z))}:function(B,Z){var ce=de(B,Z);return i.createElement(On,j({},Be,{order:Z,key:ce,item:B,renderItem:Le,itemKey:ce,registerSize:Se,display:Z<=ie}))},Fe={order:on?ie:Number.MAX_SAFE_INTEGER,className:"".concat(ne,"-rest"),registerSize:tn,display:on},Qe=S||gs,sn=E?i.createElement(Hn.Provider,{value:F(F({},Be),Fe)},E(Re)):i.createElement(On,j({},Be,Fe),typeof Qe=="function"?Qe(Re):Qe),Oe=i.createElement(C,j({className:J(!Ke&&r,w),style:b,ref:n},c),fe.map(Je),pe?sn:null,R&&i.createElement(On,j({},Be,{responsive:Ae,responsiveDisabled:!ee,order:ie,className:"".concat(ne,"-suffix"),registerSize:rn,display:!0,style:an}),R));return Ae?i.createElement(Gn,{onResize:ae,disabled:!ee},Oe):Oe}var Xe=i.forwardRef(ps);Xe.displayName="Overflow";Xe.Item=ji;Xe.RESPONSIVE=Ki;Xe.INVALIDATE=Li;function Tn(e){return Za.includes(e)}var ds=function(n){var o=n.className,r=n.prefixCls,t=n.style,s=n.color,a=n.children,f=n.text,l=n.placement,u=l===void 0?"end":l,d=i.useContext(Xn),p=d.getPrefixCls,b=d.direction,w=p("ribbon",r),x=Tn(s),S=J(w,"".concat(w,"-placement-").concat(u),M(M({},"".concat(w,"-rtl"),b==="rtl"),"".concat(w,"-color-").concat(s),x),o),E={},R={};return s&&!x&&(E.background=s,R.color=s),i.createElement("div",{className:"".concat(w,"-wrapper")},a,i.createElement("div",{className:S,style:j(j({},E),t)},i.createElement("span",{className:"".concat(w,"-text")},f),i.createElement("div",{className:"".concat(w,"-corner"),style:R})))};function Fr(e){var n=e.prefixCls,o=e.value,r=e.current,t=e.offset,s=t===void 0?0:t,a;return s&&(a={position:"absolute",top:"".concat(s,"00%"),left:0}),i.createElement("span",{style:a,className:J("".concat(n,"-only-unit"),{current:r})},o)}function ms(e,n,o){for(var r=e,t=0;(r+10)%10!==n;)r+=o,t+=o;return t}function vs(e){var n=e.prefixCls,o=e.count,r=e.value,t=Number(r),s=Math.abs(o),a=i.useState(t),f=q(a,2),l=f[0],u=f[1],d=i.useState(s),p=q(d,2),b=p[0],w=p[1],x=function(){u(t),w(s)};i.useEffect(function(){var c=setTimeout(function(){x()},1e3);return function(){clearTimeout(c)}},[t]);var S,E;if(l===t||Number.isNaN(t)||Number.isNaN(l))S=[i.createElement(Fr,j({},e,{key:t,current:!0}))],E={transition:"none"};else{S=[];for(var R=t+10,y=[],C=t;C<=R;C+=1)y.push(C);var P=y.findIndex(function(c){return c%10===l});S=y.map(function(c,_){var v=c%10;return i.createElement(Fr,j({},e,{key:c,value:v,offset:_-P,current:_===P}))});var g=b<s?1:-1;E={transform:"translateY(".concat(-ms(l,t,g),"00%)")}}return i.createElement("span",{className:"".concat(n,"-only"),style:E,onTransitionEnd:x},S)}var bs=function(e,n){var o={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&n.indexOf(r)<0&&(o[r]=e[r]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var t=0,r=Object.getOwnPropertySymbols(e);t<r.length;t++)n.indexOf(r[t])<0&&Object.prototype.propertyIsEnumerable.call(e,r[t])&&(o[r[t]]=e[r[t]]);return o},xs=function(n){var o=n.prefixCls,r=n.count,t=n.className,s=n.motionClassName,a=n.style,f=n.title,l=n.show,u=n.component,d=u===void 0?"sup":u,p=n.children,b=bs(n,["prefixCls","count","className","motionClassName","style","title","show","component","children"]),w=i.useContext(Xn),x=w.getPrefixCls,S=x("scroll-number",o),E=j(j({},b),{"data-show":l,style:a,className:J(S,t,s),title:f}),R=r;if(r&&Number(r)%1===0){var y=String(r).split("");R=y.map(function(C,P){return i.createElement(vs,{prefixCls:S,count:Number(r),value:C,key:y.length-P})})}return a&&a.borderColor&&(E.style=j(j({},a),{boxShadow:"0 0 0 1px ".concat(a.borderColor," inset")})),p?Ci(p,function(C){return{className:J("".concat(S,"-custom-component"),C==null?void 0:C.className,s)}}):i.createElement(d,E,R)},hs=function(e,n){var o={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&n.indexOf(r)<0&&(o[r]=e[r]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var t=0,r=Object.getOwnPropertySymbols(e);t<r.length;t++)n.indexOf(r[t])<0&&Object.prototype.propertyIsEnumerable.call(e,r[t])&&(o[r[t]]=e[r[t]]);return o},zi=function(n){var o=n.prefixCls,r=n.scrollNumberPrefixCls,t=n.children,s=n.status,a=n.text,f=n.color,l=n.count,u=l===void 0?null:l,d=n.overflowCount,p=d===void 0?99:d,b=n.dot,w=b===void 0?!1:b,x=n.size,S=x===void 0?"default":x,E=n.title,R=n.offset,y=n.style,C=n.className,P=n.showZero,g=P===void 0?!1:P,c=hs(n,["prefixCls","scrollNumberPrefixCls","children","status","text","color","count","overflowCount","dot","size","title","offset","style","className","showZero"]),_=i.useContext(Xn),v=_.getPrefixCls,h=_.direction,I=v("badge",o),m=u>p?"".concat(p,"+"):u,T=m==="0"||m===0,k=u===null||T&&!g,O=(s!=null||f!=null)&&k,D=w&&!T,U=D?"":m,$=i.useMemo(function(){var H=U==null||U==="";return(H||T&&!g)&&!D},[U,T,g,D]),W=i.useRef(u);$||(W.current=u);var X=W.current,ge=i.useRef(U);$||(ge.current=U);var re=ge.current,N=i.useRef(D);$||(N.current=D);var A=i.useMemo(function(){if(!R)return j({},y);var H={marginTop:R[1]};return h==="rtl"?H.left=parseInt(R[0],10):H.right=-parseInt(R[0],10),j(j({},H),y)},[h,R,y]),K=E??(typeof X=="string"||typeof X=="number"?X:void 0),G=$||!a?null:i.createElement("span",{className:"".concat(I,"-status-text")},a),be=!X||yn(X)!=="object"?void 0:Ci(X,function(H){return{style:j(j({},A),H.style)}}),ye=J(M(M(M({},"".concat(I,"-status-dot"),O),"".concat(I,"-status-").concat(s),!!s),"".concat(I,"-status-").concat(f),Tn(f))),oe={};f&&!Tn(f)&&(oe.background=f);var xe=J(I,M(M(M({},"".concat(I,"-status"),O),"".concat(I,"-not-a-wrapper"),!t),"".concat(I,"-rtl"),h==="rtl"),C);if(!t&&O){var se=A.color;return i.createElement("span",j({},c,{className:xe,style:A}),i.createElement("span",{className:ye,style:oe}),a&&i.createElement("span",{style:{color:se},className:"".concat(I,"-status-text")},a))}return i.createElement("span",j({},c,{className:xe}),t,i.createElement(_r,{visible:!$,motionName:"".concat(I,"-zoom"),motionAppear:!1,motionDeadline:1e3},function(H){var Te=H.className,Ee=v("scroll-number",r),Ie=N.current,V=J(M(M(M(M(M(M({},"".concat(I,"-dot"),Ie),"".concat(I,"-count"),!Ie),"".concat(I,"-count-sm"),S==="small"),"".concat(I,"-multiple-words"),!Ie&&re&&re.toString().length>1),"".concat(I,"-status-").concat(s),!!s),"".concat(I,"-status-").concat(f),Tn(f))),z=j({},A);return f&&!Tn(f)&&(z=z||{},z.background=f),i.createElement(xs,{prefixCls:Ee,show:!$,motionClassName:Te,className:V,count:re,title:K,style:z,key:"scrollNumber"},be)}),G)};zi.Ribbon=ds;var _s={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M176 511a56 56 0 10112 0 56 56 0 10-112 0zm280 0a56 56 0 10112 0 56 56 0 10-112 0zm280 0a56 56 0 10112 0 56 56 0 10-112 0z"}}]},name:"ellipsis",theme:"outlined"},ys=function(n,o){return i.createElement(Si,F(F({},n),{},{ref:o,icon:_s}))},ws=i.forwardRef(ys),Di=i.createContext(null);function Er(e,n){return e===void 0?null:"".concat(e,"-").concat(n)}function $i(e){var n=i.useContext(Di);return Er(n,e)}var Cs=["children","locked"],Ve=i.createContext(null);function Ss(e,n){var o=F({},e);return Object.keys(n).forEach(function(r){var t=n[r];t!==void 0&&(o[r]=t)}),o}function Mn(e){var n=e.children,o=e.locked,r=ve(e,Cs),t=i.useContext(Ve),s=Pa(function(){return Ss(t,r)},[t,r],function(a,f){return!o&&(a[0]!==f[0]||!Ei(a[1],f[1],!0))});return i.createElement(Ve.Provider,{value:s},n)}var Es=[],Bi=i.createContext(null);function Zn(){return i.useContext(Bi)}var Vi=i.createContext(Es);function Kn(e){var n=i.useContext(Vi);return i.useMemo(function(){return e!==void 0?[].concat(Ze(n),[e]):n},[n,e])}var Fi=i.createContext(null),Ir=i.createContext({});function Ur(e){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;if(Ja(e)){var o=e.nodeName.toLowerCase(),r=["input","select","textarea","button"].includes(o)||e.isContentEditable||o==="a"&&!!e.getAttribute("href"),t=e.getAttribute("tabindex"),s=Number(t),a=null;return t&&!Number.isNaN(s)?a=s:r&&a===null&&(a=0),r&&e.disabled&&(a=null),a!==null&&(a>=0||n&&a<0)}return!1}function Ui(e){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1,o=Ze(e.querySelectorAll("*")).filter(function(r){return Ur(r,n)});return Ur(e,n)&&o.unshift(e),o}var mr=_e.LEFT,vr=_e.RIGHT,br=_e.UP,Fn=_e.DOWN,Un=_e.ENTER,Wi=_e.ESC,In=_e.HOME,Rn=_e.END,Wr=[br,Fn,mr,vr];function Is(e,n,o,r){var t,s,a,f,l="prev",u="next",d="children",p="parent";if(e==="inline"&&r===Un)return{inlineTrigger:!0};var b=(t={},M(t,br,l),M(t,Fn,u),t),w=(s={},M(s,mr,o?u:l),M(s,vr,o?l:u),M(s,Fn,d),M(s,Un,d),s),x=(a={},M(a,br,l),M(a,Fn,u),M(a,Un,d),M(a,Wi,p),M(a,mr,o?d:p),M(a,vr,o?p:d),a),S={inline:b,horizontal:w,vertical:x,inlineSub:b,horizontalSub:x,verticalSub:x},E=(f=S["".concat(e).concat(n?"":"Sub")])===null||f===void 0?void 0:f[r];switch(E){case l:return{offset:-1,sibling:!0};case u:return{offset:1,sibling:!0};case p:return{offset:-1,sibling:!1};case d:return{offset:1,sibling:!1};default:return null}}function Rs(e){for(var n=e;n;){if(n.getAttribute("data-menu-list"))return n;n=n.parentElement}return null}function Ps(e,n){for(var o=e||document.activeElement;o;){if(n.has(o))return o;o=o.parentElement}return null}function Gi(e,n){var o=Ui(e,!0);return o.filter(function(r){return n.has(r)})}function Gr(e,n,o){var r=arguments.length>3&&arguments[3]!==void 0?arguments[3]:1;if(!e)return null;var t=Gi(e,n),s=t.length,a=t.findIndex(function(f){return o===f});return r<0?a===-1?a=s-1:a-=1:r>0&&(a+=1),a=(a+s)%s,t[a]}function Ts(e,n,o,r,t,s,a,f,l,u){var d=i.useRef(),p=i.useRef();p.current=n;var b=function(){Ye.cancel(d.current)};return i.useEffect(function(){return function(){b()}},[]),function(w){var x=w.which;if([].concat(Wr,[Un,Wi,In,Rn]).includes(x)){var S,E,R,y=function(){S=new Set,E=new Map,R=new Map;var D=s();return D.forEach(function(U){var $=document.querySelector("[data-menu-id='".concat(Er(r,U),"']"));$&&(S.add($),R.set($,U),E.set(U,$))}),S};y();var C=E.get(n),P=Ps(C,S),g=R.get(P),c=Is(e,a(g,!0).length===1,o,x);if(!c&&x!==In&&x!==Rn)return;(Wr.includes(x)||[In,Rn].includes(x))&&w.preventDefault();var _=function(D){if(D){var U=D,$=D.querySelector("a");$!=null&&$.getAttribute("href")&&(U=$);var W=R.get(D);f(W),b(),d.current=Ye(function(){p.current===W&&U.focus()})}};if([In,Rn].includes(x)||c.sibling||!P){var v;!P||e==="inline"?v=t.current:v=Rs(P);var h,I=Gi(v,S);x===In?h=I[0]:x===Rn?h=I[I.length-1]:h=Gr(v,S,P,c.offset),_(h)}else if(c.inlineTrigger)l(g);else if(c.offset>0)l(g,!0),b(),d.current=Ye(function(){y();var O=P.getAttribute("aria-controls"),D=document.getElementById(O),U=Gr(D,S);_(U)},5);else if(c.offset<0){var m=a(g,!0),T=m[m.length-2],k=E.get(T);l(T,!1),_(k)}}u==null||u(w)}}function ks(e){Promise.resolve().then(e)}var Rr="__RC_UTIL_PATH_SPLIT__",Hr=function(n){return n.join(Rr)},Ns=function(n){return n.split(Rr)},xr="rc-menu-more";function As(){var e=i.useState({}),n=q(e,2),o=n[1],r=i.useRef(new Map),t=i.useRef(new Map),s=i.useState([]),a=q(s,2),f=a[0],l=a[1],u=i.useRef(0),d=i.useRef(!1),p=function(){d.current||o({})},b=i.useCallback(function(C,P){var g=Hr(P);t.current.set(g,C),r.current.set(C,g),u.current+=1;var c=u.current;ks(function(){c===u.current&&p()})},[]),w=i.useCallback(function(C,P){var g=Hr(P);t.current.delete(g),r.current.delete(C)},[]),x=i.useCallback(function(C){l(C)},[]),S=i.useCallback(function(C,P){var g=r.current.get(C)||"",c=Ns(g);return P&&f.includes(c[0])&&c.unshift(xr),c},[f]),E=i.useCallback(function(C,P){return C.some(function(g){var c=S(g,!0);return c.includes(P)})},[S]),R=function(){var P=Ze(r.current.keys());return f.length&&P.push(xr),P},y=i.useCallback(function(C){var P="".concat(r.current.get(C)).concat(Rr),g=new Set;return Ze(t.current.keys()).forEach(function(c){c.startsWith(P)&&g.add(t.current.get(c))}),g},[]);return i.useEffect(function(){return function(){d.current=!0}},[]),{registerPath:b,unregisterPath:w,refreshOverflowKeys:x,isSubPathKey:E,getKeyPath:S,getKeys:R,getSubPathKeys:y}}function xn(e){var n=i.useRef(e);n.current=e;var o=i.useCallback(function(){for(var r,t=arguments.length,s=new Array(t),a=0;a<t;a++)s[a]=arguments[a];return(r=n.current)===null||r===void 0?void 0:r.call.apply(r,[n].concat(s))},[]);return e?o:void 0}var Os=Math.random().toFixed(5).toString().slice(2),Yr=0;function Ms(e){var n=_n(e,{value:e}),o=q(n,2),r=o[0],t=o[1];return i.useEffect(function(){Yr+=1;var s="".concat(Os,"-").concat(Yr);t("rc-menu-uuid-".concat(s))},[]),r}function Hi(e,n,o,r){var t=i.useContext(Ve),s=t.activeKey,a=t.onActive,f=t.onInactive,l={active:s===e};return n||(l.onMouseEnter=function(u){o==null||o({key:e,domEvent:u}),a(e)},l.onMouseLeave=function(u){r==null||r({key:e,domEvent:u}),f(e)}),l}function Yi(e){var n=i.useContext(Ve),o=n.mode,r=n.rtl,t=n.inlineIndent;if(o!=="inline")return null;var s=e;return r?{paddingRight:s*t}:{paddingLeft:s*t}}function Xi(e){var n=e.icon,o=e.props,r=e.children,t;return typeof n=="function"?t=i.createElement(n,F({},o)):t=n,t||r||null}var qs=["item"];function Yn(e){var n=e.item,o=ve(e,qs);return Object.defineProperty(o,"item",{get:function(){return Ii(!1,"`info.item` is deprecated since we will move to function component that not provides React Node instance in future."),n}}),o}var js=["title","attribute","elementRef"],Ks=["style","className","eventKey","warnKey","disabled","itemIcon","children","role","onMouseEnter","onMouseLeave","onClick","onKeyDown","onFocus"],Ls=["active"],zs=function(e){Ta(o,e);var n=ka(o);function o(){return Na(this,o),n.apply(this,arguments)}return Aa(o,[{key:"render",value:function(){var t=this.props,s=t.title,a=t.attribute,f=t.elementRef,l=ve(t,js),u=Pi(l,["eventKey","popupClassName","popupOffset","onTitleClick"]);return Ii(!a,"`attribute` of Menu.Item is deprecated. Please pass attribute directly."),i.createElement(Xe.Item,j({},a,{title:typeof s=="string"?s:void 0},u,{ref:f}))}}]),o}(i.Component),Ds=i.forwardRef(function(e,n){var o,r=e.style,t=e.className,s=e.eventKey;e.warnKey;var a=e.disabled,f=e.itemIcon,l=e.children,u=e.role,d=e.onMouseEnter,p=e.onMouseLeave,b=e.onClick,w=e.onKeyDown,x=e.onFocus,S=ve(e,Ks),E=$i(s),R=i.useContext(Ve),y=R.prefixCls,C=R.onItemClick,P=R.disabled,g=R.overflowDisabled,c=R.itemIcon,_=R.selectedKeys,v=R.onActive,h=i.useContext(Ir),I=h._internalRenderMenuItem,m="".concat(y,"-item"),T=i.useRef(),k=i.useRef(),O=P||a,D=Ri(n,k),U=Kn(s),$=function(se){return{key:s,keyPath:Ze(U).reverse(),item:T.current,domEvent:se}},W=f||c,X=Hi(s,O,d,p),ge=X.active,re=ve(X,Ls),N=_.includes(s),A=Yi(U.length),K=function(se){if(!O){var H=$(se);b==null||b(Yn(H)),C(H)}},G=function(se){if(w==null||w(se),se.which===_e.ENTER){var H=$(se);b==null||b(Yn(H)),C(H)}},be=function(se){v(s),x==null||x(se)},ye={};e.role==="option"&&(ye["aria-selected"]=N);var oe=i.createElement(zs,j({ref:T,elementRef:D,role:u===null?"none":u||"menuitem",tabIndex:a?null:-1,"data-menu-id":g&&E?null:E},S,re,ye,{component:"li","aria-disabled":a,style:F(F({},A),r),className:J(m,(o={},M(o,"".concat(m,"-active"),ge),M(o,"".concat(m,"-selected"),N),M(o,"".concat(m,"-disabled"),O),o),t),onClick:K,onKeyDown:G,onFocus:be}),l,i.createElement(Xi,{props:F(F({},e),{},{isSelected:N}),icon:W}));return I&&(oe=I(oe,e,{selected:N})),oe});function $s(e,n){var o=e.eventKey,r=Zn(),t=Kn(o);return i.useEffect(function(){if(r)return r.registerPath(o,t),function(){r.unregisterPath(o,t)}},[t]),r?null:i.createElement(Ds,j({},e,{ref:n}))}const Jn=i.forwardRef($s);var Bs=["className","children"],Vs=function(n,o){var r=n.className,t=n.children,s=ve(n,Bs),a=i.useContext(Ve),f=a.prefixCls,l=a.mode,u=a.rtl;return i.createElement("ul",j({className:J(f,u&&"".concat(f,"-rtl"),"".concat(f,"-sub"),"".concat(f,"-").concat(l==="inline"?"inline":"vertical"),r),role:"menu"},s,{"data-menu-list":!0,ref:o}),t)},Pr=i.forwardRef(Vs);Pr.displayName="SubMenuList";var Fs=["label","children","key","type"];function Tr(e,n){return Ti(e).map(function(o,r){if(i.isValidElement(o)){var t,s,a=o.key,f=(t=(s=o.props)===null||s===void 0?void 0:s.eventKey)!==null&&t!==void 0?t:a,l=f==null;l&&(f="tmp_key-".concat([].concat(Ze(n),[r]).join("-")));var u={key:f,eventKey:f};return i.cloneElement(o,u)}return o})}function hr(e){return(e||[]).map(function(n,o){if(n&&yn(n)==="object"){var r=n,t=r.label,s=r.children,a=r.key,f=r.type,l=ve(r,Fs),u=a??"tmp-".concat(o);return s||f==="group"?f==="group"?i.createElement(Ji,j({key:u},l,{title:t}),hr(s)):i.createElement(kr,j({key:u},l,{title:t}),hr(s)):f==="divider"?i.createElement(Qi,j({key:u},l)):i.createElement(Jn,j({key:u},l),t)}return null}).filter(function(n){return n})}function Us(e,n,o){var r=e;return n&&(r=hr(n)),Tr(r,o)}var nn={adjustX:1,adjustY:1},Ws={topLeft:{points:["bl","tl"],overflow:nn,offset:[0,-7]},bottomLeft:{points:["tl","bl"],overflow:nn,offset:[0,7]},leftTop:{points:["tr","tl"],overflow:nn,offset:[-4,0]},rightTop:{points:["tl","tr"],overflow:nn,offset:[4,0]}},Gs={topLeft:{points:["bl","tl"],overflow:nn,offset:[0,-7]},bottomLeft:{points:["tl","bl"],overflow:nn,offset:[0,7]},rightTop:{points:["tr","tl"],overflow:nn,offset:[-4,0]},leftTop:{points:["tl","tr"],overflow:nn,offset:[4,0]}};function Zi(e,n,o){if(n)return n;if(o)return o[e]||o.other}var Hs={horizontal:"bottomLeft",vertical:"rightTop","vertical-left":"rightTop","vertical-right":"leftTop"};function Ys(e){var n=e.prefixCls,o=e.visible,r=e.children,t=e.popup,s=e.popupClassName,a=e.popupOffset,f=e.disabled,l=e.mode,u=e.onVisibleChange,d=i.useContext(Ve),p=d.getPopupContainer,b=d.rtl,w=d.subMenuOpenDelay,x=d.subMenuCloseDelay,S=d.builtinPlacements,E=d.triggerSubMenuAction,R=d.forceSubMenuRender,y=d.rootClassName,C=d.motion,P=d.defaultMotions,g=i.useState(!1),c=q(g,2),_=c[0],v=c[1],h=b?F(F({},Gs),S):F(F({},Ws),S),I=Hs[l],m=Zi(l,C,P),T=i.useRef(m);l!=="inline"&&(T.current=m);var k=F(F({},T.current),{},{leavedClassName:"".concat(n,"-hidden"),removeOnLeave:!1,motionAppear:!0}),O=i.useRef();return i.useEffect(function(){return O.current=Ye(function(){v(o)}),function(){Ye.cancel(O.current)}},[o]),i.createElement(Oi,{prefixCls:n,popupClassName:J("".concat(n,"-popup"),M({},"".concat(n,"-rtl"),b),s,y),stretch:l==="horizontal"?"minWidth":null,getPopupContainer:p,builtinPlacements:h,popupPlacement:I,popupVisible:_,popup:t,popupAlign:a&&{offset:a},action:f?[]:[E],mouseEnterDelay:w,mouseLeaveDelay:x,onPopupVisibleChange:u,forceRender:R,popupMotion:k},r)}function Xs(e){var n=e.id,o=e.open,r=e.keyPath,t=e.children,s="inline",a=i.useContext(Ve),f=a.prefixCls,l=a.forceSubMenuRender,u=a.motion,d=a.defaultMotions,p=a.mode,b=i.useRef(!1);b.current=p===s;var w=i.useState(!b.current),x=q(w,2),S=x[0],E=x[1],R=b.current?o:!1;i.useEffect(function(){b.current&&E(!1)},[p]);var y=F({},Zi(s,u,d));r.length>1&&(y.motionAppear=!1);var C=y.onVisibleChanged;return y.onVisibleChanged=function(P){return!b.current&&!P&&E(!0),C==null?void 0:C(P)},S?null:i.createElement(Mn,{mode:s,locked:!b.current},i.createElement(_r,j({visible:R},y,{forceRender:l,removeOnLeave:!1,leavedClassName:"".concat(f,"-hidden")}),function(P){var g=P.className,c=P.style;return i.createElement(Pr,{id:n,className:g,style:c},t)}))}var Zs=["style","className","title","eventKey","warnKey","disabled","internalPopupClose","children","itemIcon","expandIcon","popupClassName","popupOffset","onClick","onMouseEnter","onMouseLeave","onTitleClick","onTitleMouseEnter","onTitleMouseLeave"],Js=["active"],Qs=function(n){var o,r=n.style,t=n.className,s=n.title,a=n.eventKey;n.warnKey;var f=n.disabled,l=n.internalPopupClose,u=n.children,d=n.itemIcon,p=n.expandIcon,b=n.popupClassName,w=n.popupOffset,x=n.onClick,S=n.onMouseEnter,E=n.onMouseLeave,R=n.onTitleClick,y=n.onTitleMouseEnter,C=n.onTitleMouseLeave,P=ve(n,Zs),g=$i(a),c=i.useContext(Ve),_=c.prefixCls,v=c.mode,h=c.openKeys,I=c.disabled,m=c.overflowDisabled,T=c.activeKey,k=c.selectedKeys,O=c.itemIcon,D=c.expandIcon,U=c.onItemClick,$=c.onOpenChange,W=c.onActive,X=i.useContext(Ir),ge=X._internalRenderSubMenuItem,re=i.useContext(Fi),N=re.isSubPathKey,A=Kn(),K="".concat(_,"-submenu"),G=I||f,be=i.useRef(),ye=i.useRef(),oe=d||O,xe=p||D,se=h.includes(a),H=!m&&se,Te=N(k,a),Ee=Hi(a,G,y,C),Ie=Ee.active,V=ve(Ee,Js),z=i.useState(!1),L=q(z,2),ie=L[0],ke=L[1],Me=function(Se){G||ke(Se)},he=function(Se){Me(!0),S==null||S({key:a,domEvent:Se})},we=function(Se){Me(!1),E==null||E({key:a,domEvent:Se})},ne=i.useMemo(function(){return Ie||(v!=="inline"?ie||N([T],a):!1)},[v,Ie,T,ie,a,N]),Ne=Yi(A.length),Ae=function(Se){G||(R==null||R({key:a,domEvent:Se}),v==="inline"&&$(a,!se))},ee=xn(function(ae){x==null||x(Yn(ae)),U(ae)}),Ke=function(Se){v!=="inline"&&$(a,Se)},pe=function(){W(a)},fe=g&&"".concat(g,"-popup"),Re=i.createElement("div",j({role:"menuitem",style:Ne,className:"".concat(K,"-title"),tabIndex:G?null:-1,ref:be,title:typeof s=="string"?s:null,"data-menu-id":m&&g?null:g,"aria-expanded":H,"aria-haspopup":!0,"aria-controls":fe,"aria-disabled":G,onClick:Ae,onFocus:pe},V),s,i.createElement(Xi,{icon:v!=="horizontal"?xe:null,props:F(F({},n),{},{isOpen:H,isSubMenu:!0})},i.createElement("i",{className:"".concat(K,"-arrow")}))),de=i.useRef(v);if(v!=="inline"&&A.length>1?de.current="vertical":de.current=v,!m){var Le=de.current;Re=i.createElement(Ys,{mode:Le,prefixCls:K,visible:!l&&H&&v!=="inline",popupClassName:b,popupOffset:w,popup:i.createElement(Mn,{mode:Le==="horizontal"?"vertical":Le},i.createElement(Pr,{id:fe,ref:ye},u)),disabled:G,onVisibleChange:Ke},Re)}var le=i.createElement(Xe.Item,j({role:"none"},P,{component:"li",style:r,className:J(K,"".concat(K,"-").concat(v),t,(o={},M(o,"".concat(K,"-open"),H),M(o,"".concat(K,"-active"),ne),M(o,"".concat(K,"-selected"),Te),M(o,"".concat(K,"-disabled"),G),o)),onMouseEnter:he,onMouseLeave:we}),Re,!m&&i.createElement(Xs,{id:fe,open:H,keyPath:A},u));return ge&&(le=ge(le,n,{selected:Te,active:ne,open:H,disabled:G})),i.createElement(Mn,{onItemClick:ee,mode:v==="horizontal"?"vertical":v,itemIcon:oe,expandIcon:xe},le)};function kr(e){var n=e.eventKey,o=e.children,r=Kn(n),t=Tr(o,r),s=Zn();i.useEffect(function(){if(s)return s.registerPath(n,r),function(){s.unregisterPath(n,r)}},[r]);var a;return s?a=t:a=i.createElement(Qs,e,t),i.createElement(Vi.Provider,{value:r},a)}var ef=["prefixCls","rootClassName","style","className","tabIndex","items","children","direction","id","mode","inlineCollapsed","disabled","disabledOverflow","subMenuOpenDelay","subMenuCloseDelay","forceSubMenuRender","defaultOpenKeys","openKeys","activeKey","defaultActiveFirst","selectable","multiple","defaultSelectedKeys","selectedKeys","onSelect","onDeselect","inlineIndent","motion","defaultMotions","triggerSubMenuAction","builtinPlacements","itemIcon","expandIcon","overflowedIndicator","overflowedIndicatorPopupClassName","getPopupContainer","onClick","onOpenChange","onKeyDown","openAnimation","openTransitionName","_internalRenderMenuItem","_internalRenderSubMenuItem"],dn=[],nf=i.forwardRef(function(e,n){var o,r,t=e,s=t.prefixCls,a=s===void 0?"rc-menu":s,f=t.rootClassName,l=t.style,u=t.className,d=t.tabIndex,p=d===void 0?0:d,b=t.items,w=t.children,x=t.direction,S=t.id,E=t.mode,R=E===void 0?"vertical":E,y=t.inlineCollapsed,C=t.disabled,P=t.disabledOverflow,g=t.subMenuOpenDelay,c=g===void 0?.1:g,_=t.subMenuCloseDelay,v=_===void 0?.1:_,h=t.forceSubMenuRender,I=t.defaultOpenKeys,m=t.openKeys,T=t.activeKey,k=t.defaultActiveFirst,O=t.selectable,D=O===void 0?!0:O,U=t.multiple,$=U===void 0?!1:U,W=t.defaultSelectedKeys,X=t.selectedKeys,ge=t.onSelect,re=t.onDeselect,N=t.inlineIndent,A=N===void 0?24:N,K=t.motion,G=t.defaultMotions,be=t.triggerSubMenuAction,ye=be===void 0?"hover":be,oe=t.builtinPlacements,xe=t.itemIcon,se=t.expandIcon,H=t.overflowedIndicator,Te=H===void 0?"...":H,Ee=t.overflowedIndicatorPopupClassName,Ie=t.getPopupContainer,V=t.onClick,z=t.onOpenChange,L=t.onKeyDown;t.openAnimation,t.openTransitionName;var ie=t._internalRenderMenuItem,ke=t._internalRenderSubMenuItem,Me=ve(t,ef),he=i.useMemo(function(){return Us(w,b,dn)},[w,b]),we=i.useState(!1),ne=q(we,2),Ne=ne[0],Ae=ne[1],ee=i.useRef(),Ke=Ms(S),pe=x==="rtl",fe=_n(I,{value:m,postState:function(te){return te||dn}}),Re=q(fe,2),de=Re[0],Le=Re[1],le=function(te){var ue=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;function je(){Le(te),z==null||z(te)}ue?wi.flushSync(je):je()},ae=i.useState(de),Se=q(ae,2),tn=Se[0],rn=Se[1],He=i.useRef(!1),on=i.useMemo(function(){return(R==="inline"||R==="vertical")&&y?["vertical",y]:[R,!1]},[R,y]),an=q(on,2),Be=an[0],Je=an[1],Fe=Be==="inline",Qe=i.useState(Be),sn=q(Qe,2),Oe=sn[0],B=sn[1],Z=i.useState(Je),ce=q(Z,2),qe=ce[0],Ue=ce[1];i.useEffect(function(){B(Be),Ue(Je),He.current&&(Fe?Le(tn):le(dn))},[Be,Je]);var nt=i.useState(0),zn=q(nt,2),ze=zn[0],Dn=zn[1],un=ze>=he.length-1||Oe!=="horizontal"||P;i.useEffect(function(){Fe&&rn(de)},[de]),i.useEffect(function(){return He.current=!0,function(){He.current=!1}},[]);var We=As(),en=We.registerPath,gn=We.unregisterPath,wn=We.refreshOverflowKeys,Cn=We.isSubPathKey,$n=We.getKeyPath,Q=We.getKeys,Y=We.getSubPathKeys,Ce=i.useMemo(function(){return{registerPath:en,unregisterPath:gn}},[en,gn]),Pe=i.useMemo(function(){return{isSubPathKey:Cn}},[Cn]);i.useEffect(function(){wn(un?dn:he.slice(ze+1).map(function(me){return me.key}))},[ze,un]);var Ge=_n(T||k&&((o=he[0])===null||o===void 0?void 0:o.key),{value:T}),De=q(Ge,2),fn=De[0],tt=De[1],da=xn(function(me){tt(me)}),ma=xn(function(){tt(void 0)});i.useImperativeHandle(n,function(){return{list:ee.current,focus:function(te){var ue,je=fn??((ue=he.find(function(Ia){return!Ia.props.disabled}))===null||ue===void 0?void 0:ue.key);if(je){var $e,ln,Sn;($e=ee.current)===null||$e===void 0||(ln=$e.querySelector("li[data-menu-id='".concat(Er(Ke,je),"']")))===null||ln===void 0||(Sn=ln.focus)===null||Sn===void 0||Sn.call(ln,te)}}}});var va=_n(W||[],{value:X,postState:function(te){return Array.isArray(te)?te:te==null?dn:[te]}}),zr=q(va,2),Bn=zr[0],ba=zr[1],xa=function(te){if(D){var ue=te.key,je=Bn.includes(ue),$e;$?je?$e=Bn.filter(function(Sn){return Sn!==ue}):$e=[].concat(Ze(Bn),[ue]):$e=[ue],ba($e);var ln=F(F({},te),{},{selectedKeys:$e});je?re==null||re(ln):ge==null||ge(ln)}!$&&de.length&&Oe!=="inline"&&le(dn)},ha=xn(function(me){V==null||V(Yn(me)),xa(me)}),Dr=xn(function(me,te){var ue=de.filter(function($e){return $e!==me});if(te)ue.push(me);else if(Oe!=="inline"){var je=Y(me);ue=ue.filter(function($e){return!je.has($e)})}Ei(de,ue,!0)||le(ue,!0)}),_a=xn(Ie),ya=function(te,ue){var je=ue??!de.includes(te);Dr(te,je)},wa=Ts(Oe,fn,pe,Ke,ee,Q,$n,tt,ya,L);i.useEffect(function(){Ae(!0)},[]);var Ca=i.useMemo(function(){return{_internalRenderMenuItem:ie,_internalRenderSubMenuItem:ke}},[ie,ke]),Sa=Oe!=="horizontal"||P?he:he.map(function(me,te){return i.createElement(Mn,{key:me.key,overflowDisabled:te>ze},me)}),Ea=i.createElement(Xe,j({id:S,ref:ee,prefixCls:"".concat(a,"-overflow"),component:"ul",itemComponent:Jn,className:J(a,"".concat(a,"-root"),"".concat(a,"-").concat(Oe),u,(r={},M(r,"".concat(a,"-inline-collapsed"),qe),M(r,"".concat(a,"-rtl"),pe),r),f),dir:x,style:l,role:"menu",tabIndex:p,data:Sa,renderRawItem:function(te){return te},renderRawRest:function(te){var ue=te.length,je=ue?he.slice(-ue):null;return i.createElement(kr,{eventKey:xr,title:Te,disabled:un,internalPopupClose:ue===0,popupClassName:Ee},je)},maxCount:Oe!=="horizontal"||P?Xe.INVALIDATE:Xe.RESPONSIVE,ssr:"full","data-menu-list":!0,onVisibleChange:function(te){Dn(te)},onKeyDown:wa},Me));return i.createElement(Ir.Provider,{value:Ca},i.createElement(Di.Provider,{value:Ke},i.createElement(Mn,{prefixCls:a,rootClassName:f,mode:Oe,openKeys:de,rtl:pe,disabled:C,motion:Ne?K:null,defaultMotions:Ne?G:null,activeKey:fn,onActive:da,onInactive:ma,selectedKeys:Bn,inlineIndent:A,subMenuOpenDelay:c,subMenuCloseDelay:v,forceSubMenuRender:h,builtinPlacements:oe,triggerSubMenuAction:ye,getPopupContainer:_a,itemIcon:xe,expandIcon:se,onItemClick:ha,onOpenChange:Dr},i.createElement(Fi.Provider,{value:Pe},Ea),i.createElement("div",{style:{display:"none"},"aria-hidden":!0},i.createElement(Bi.Provider,{value:Ce},he)))))}),tf=["className","title","eventKey","children"],rf=["children"],of=function(n){var o=n.className,r=n.title;n.eventKey;var t=n.children,s=ve(n,tf),a=i.useContext(Ve),f=a.prefixCls,l="".concat(f,"-item-group");return i.createElement("li",j({role:"presentation"},s,{onClick:function(d){return d.stopPropagation()},className:J(l,o)}),i.createElement("div",{role:"presentation",className:"".concat(l,"-title"),title:typeof r=="string"?r:void 0},r),i.createElement("ul",{role:"group",className:"".concat(l,"-list")},t))};function Ji(e){var n=e.children,o=ve(e,rf),r=Kn(o.eventKey),t=Tr(n,r),s=Zn();return s?t:i.createElement(of,Pi(o,["warnKey"]),t)}function Qi(e){var n=e.className,o=e.style,r=i.useContext(Ve),t=r.prefixCls,s=Zn();return s?null:i.createElement("li",{className:J("".concat(t,"-item-divider"),n),style:o})}var Ln=nf;Ln.Item=Jn;Ln.SubMenu=kr;Ln.ItemGroup=Ji;Ln.Divider=Qi;var mn={adjustX:1,adjustY:1},vn=[0,0],af={topLeft:{points:["bl","tl"],overflow:mn,offset:[0,-4],targetOffset:vn},topCenter:{points:["bc","tc"],overflow:mn,offset:[0,-4],targetOffset:vn},topRight:{points:["br","tr"],overflow:mn,offset:[0,-4],targetOffset:vn},bottomLeft:{points:["tl","bl"],overflow:mn,offset:[0,4],targetOffset:vn},bottomCenter:{points:["tc","bc"],overflow:mn,offset:[0,4],targetOffset:vn},bottomRight:{points:["tr","br"],overflow:mn,offset:[0,4],targetOffset:vn}},sf=_e.ESC,ff=_e.TAB;function lf(e){var n=e.visible,o=e.setTriggerVisible,r=e.triggerRef,t=e.onVisibleChange,s=e.autoFocus,a=i.useRef(!1),f=function(){if(n&&r.current){var p,b,w,x;(p=r.current)===null||p===void 0||(b=p.triggerRef)===null||b===void 0||(w=b.current)===null||w===void 0||(x=w.focus)===null||x===void 0||x.call(w),o(!1),typeof t=="function"&&t(!1)}},l=function(){var p,b,w,x,S=Ui((p=r.current)===null||p===void 0||(b=p.popupRef)===null||b===void 0||(w=b.current)===null||w===void 0||(x=w.getElement)===null||x===void 0?void 0:x.call(w)),E=S[0];return E!=null&&E.focus?(E.focus(),a.current=!0,!0):!1},u=function(p){switch(p.keyCode){case sf:f();break;case ff:{var b=!1;a.current||(b=l()),b?p.preventDefault():f();break}}};i.useEffect(function(){return n?(window.addEventListener("keydown",u),s&&Ye(l,3),function(){window.removeEventListener("keydown",u),a.current=!1}):function(){a.current=!1}},[n])}var cf=["arrow","prefixCls","transitionName","animation","align","placement","placements","getPopupContainer","showAction","hideAction","overlayClassName","overlayStyle","visible","trigger","autoFocus"];function uf(e,n){var o=e.arrow,r=o===void 0?!1:o,t=e.prefixCls,s=t===void 0?"rc-dropdown":t,a=e.transitionName,f=e.animation,l=e.align,u=e.placement,d=u===void 0?"bottomLeft":u,p=e.placements,b=p===void 0?af:p,w=e.getPopupContainer,x=e.showAction,S=e.hideAction,E=e.overlayClassName,R=e.overlayStyle,y=e.visible,C=e.trigger,P=C===void 0?["hover"]:C,g=e.autoFocus,c=ve(e,cf),_=i.useState(),v=q(_,2),h=v[0],I=v[1],m="visible"in e?y:h,T=i.useRef(null);i.useImperativeHandle(n,function(){return T.current}),lf({visible:m,setTriggerVisible:I,triggerRef:T,onVisibleChange:e.onVisibleChange,autoFocus:g});var k=function(){var A=e.overlay,K;return typeof A=="function"?K=A():K=A,K},O=function(A){var K=e.onOverlayClick;I(!1),K&&K(A)},D=function(A){var K=e.onVisibleChange;I(A),typeof K=="function"&&K(A)},U=function(){var A=k();return i.createElement(i.Fragment,null,r&&i.createElement("div",{className:"".concat(s,"-arrow")}),A)},$=function(){var A=e.overlay;return typeof A=="function"?U:U()},W=function(){var A=e.minOverlayWidthMatchTrigger,K=e.alignPoint;return"minOverlayWidthMatchTrigger"in e?A:!K},X=function(){var A=e.openClassName;return A!==void 0?A:"".concat(s,"-open")},ge=function(){var A=e.children,K=A.props?A.props:{},G=J(K.className,X());return m&&A?i.cloneElement(A,{className:G}):A},re=S;return!re&&P.indexOf("contextMenu")!==-1&&(re=["click"]),i.createElement(Oi,F(F({builtinPlacements:b},c),{},{prefixCls:s,ref:T,popupClassName:J(E,M({},"".concat(s,"-show-arrow"),r)),popupStyle:R,action:P,showAction:x,hideAction:re||[],popupPlacement:d,popupAlign:l,popupTransitionName:a,popupAnimation:f,popupVisible:m,stretch:W()?"minWidth":"",popup:$(),onPopupVisibleChange:D,onPopupClick:O,getPopupContainer:w}),ge())}const gf=i.forwardRef(uf);var pf={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M482 152h60q8 0 8 8v704q0 8-8 8h-60q-8 0-8-8V160q0-8 8-8z"}},{tag:"path",attrs:{d:"M192 474h672q8 0 8 8v60q0 8-8 8H160q-8 0-8-8v-60q0-8 8-8z"}}]},name:"plus",theme:"outlined"},df=function(n,o){return i.createElement(Si,F(F({},n),{},{ref:o,icon:pf}))},mf=i.forwardRef(df);const Qn=i.createContext(null);var ea=i.forwardRef(function(e,n){var o=e.prefixCls,r=e.className,t=e.style,s=e.id,a=e.active,f=e.tabKey,l=e.children;return i.createElement("div",{id:s&&"".concat(s,"-panel-").concat(f),role:"tabpanel",tabIndex:a?0:-1,"aria-labelledby":s&&"".concat(s,"-tab-").concat(f),"aria-hidden":!a,style:t,className:J(o,a&&"".concat(o,"-active"),r),ref:n},l)}),vf=["key","forceRender","style","className"];function bf(e){var n=e.id,o=e.activeKey,r=e.animated,t=e.tabPosition,s=e.destroyInactiveTabPane,a=i.useContext(Qn),f=a.prefixCls,l=a.tabs,u=r.tabPane,d="".concat(f,"-tabpane");return i.createElement("div",{className:J("".concat(f,"-content-holder"))},i.createElement("div",{className:J("".concat(f,"-content"),"".concat(f,"-content-").concat(t),M({},"".concat(f,"-content-animated"),u))},l.map(function(p){var b=p.key,w=p.forceRender,x=p.style,S=p.className,E=ve(p,vf),R=b===o;return i.createElement(_r,j({key:b,visible:R,forceRender:w,removeOnLeave:!!s,leavedClassName:"".concat(d,"-hidden")},r.tabPaneMotion),function(y,C){var P=y.style,g=y.className;return i.createElement(ea,j({},E,{prefixCls:d,id:n,tabKey:b,animated:u,active:R,style:F(F({},x),P),className:J(S,g),ref:C}))})})))}var Xr={width:0,height:0,left:0,top:0};function xf(e,n,o){return i.useMemo(function(){for(var r,t=new Map,s=n.get((r=e[0])===null||r===void 0?void 0:r.key)||Xr,a=s.left+s.width,f=0;f<e.length;f+=1){var l=e[f].key,u=n.get(l);if(!u){var d;u=n.get((d=e[f-1])===null||d===void 0?void 0:d.key)||Xr}var p=t.get(l)||F({},u);p.right=a-p.left-p.width,t.set(l,p)}return t},[e.map(function(r){return r.key}).join("_"),n,o])}function Zr(e,n){var o=i.useRef(e),r=i.useState({}),t=q(r,2),s=t[1];function a(f){var l=typeof f=="function"?f(o.current):f;l!==o.current&&n(l,o.current),o.current=l,s({})}return[o.current,a]}var hf=.1,Jr=.01,Wn=20,Qr=Math.pow(.995,Wn);function _f(e,n){var o=i.useState(),r=q(o,2),t=r[0],s=r[1],a=i.useState(0),f=q(a,2),l=f[0],u=f[1],d=i.useState(0),p=q(d,2),b=p[0],w=p[1],x=i.useState(),S=q(x,2),E=S[0],R=S[1],y=i.useRef();function C(h){var I=h.touches[0],m=I.screenX,T=I.screenY;s({x:m,y:T}),window.clearInterval(y.current)}function P(h){if(t){h.preventDefault();var I=h.touches[0],m=I.screenX,T=I.screenY;s({x:m,y:T});var k=m-t.x,O=T-t.y;n(k,O);var D=Date.now();u(D),w(D-l),R({x:k,y:O})}}function g(){if(t&&(s(null),R(null),E)){var h=E.x/b,I=E.y/b,m=Math.abs(h),T=Math.abs(I);if(Math.max(m,T)<hf)return;var k=h,O=I;y.current=window.setInterval(function(){if(Math.abs(k)<Jr&&Math.abs(O)<Jr){window.clearInterval(y.current);return}k*=Qr,O*=Qr,n(k*Wn,O*Wn)},Wn)}}var c=i.useRef();function _(h){var I=h.deltaX,m=h.deltaY,T=0,k=Math.abs(I),O=Math.abs(m);k===O?T=c.current==="x"?I:m:k>O?(T=I,c.current="x"):(T=m,c.current="y"),n(-T,-T)&&h.preventDefault()}var v=i.useRef(null);v.current={onTouchStart:C,onTouchMove:P,onTouchEnd:g,onWheel:_},i.useEffect(function(){function h(k){v.current.onTouchStart(k)}function I(k){v.current.onTouchMove(k)}function m(k){v.current.onTouchEnd(k)}function T(k){v.current.onWheel(k)}return document.addEventListener("touchmove",I,{passive:!1}),document.addEventListener("touchend",m,{passive:!1}),e.current.addEventListener("touchstart",h,{passive:!1}),e.current.addEventListener("wheel",T),function(){document.removeEventListener("touchmove",I),document.removeEventListener("touchend",m)}},[])}function na(e){var n=i.useState(0),o=q(n,2),r=o[0],t=o[1],s=i.useRef(0),a=i.useRef();return a.current=e,Oa(function(){var f;(f=a.current)===null||f===void 0||f.call(a)},[r]),function(){s.current===r&&(s.current+=1,t(s.current))}}function yf(e){var n=i.useRef([]),o=i.useState({}),r=q(o,2),t=r[1],s=i.useRef(typeof e=="function"?e():e),a=na(function(){var l=s.current;n.current.forEach(function(u){l=u(l)}),n.current=[],s.current=l,t({})});function f(l){n.current.push(l),a()}return[s.current,f]}var eo={width:0,height:0,left:0,top:0,right:0};function wf(e,n,o,r,t,s,a){var f=a.tabs,l=a.tabPosition,u=a.rtl,d,p,b;return["top","bottom"].includes(l)?(d="width",p=u?"right":"left",b=Math.abs(o)):(d="height",p="top",b=-o),i.useMemo(function(){if(!f.length)return[0,0];for(var w=f.length,x=w,S=0;S<w;S+=1){var E=e.get(f[S].key)||eo;if(E[p]+E[d]>b+n){x=S-1;break}}for(var R=0,y=w-1;y>=0;y-=1){var C=e.get(f[y].key)||eo;if(C[p]<b){R=y+1;break}}return[R,x]},[e,n,r,t,s,b,l,f.map(function(w){return w.key}).join("_"),u])}function no(e){var n;return e instanceof Map?(n={},e.forEach(function(o,r){n[r]=o})):n=e,JSON.stringify(n)}var Cf="TABS_DQ";function ta(e){return String(e).replace(/"/g,Cf)}function Sf(e,n){var o=e.prefixCls,r=e.editable,t=e.locale,s=e.style;return!r||r.showAdd===!1?null:i.createElement("button",{ref:n,type:"button",className:"".concat(o,"-nav-add"),style:s,"aria-label":(t==null?void 0:t.addAriaLabel)||"Add tab",onClick:function(f){r.onEdit("add",{event:f})}},r.addIcon||"+")}const ra=i.forwardRef(Sf);var to=i.forwardRef(function(e,n){var o=e.position,r=e.prefixCls,t=e.extra;if(!t)return null;var s,a={};return yn(t)==="object"&&!i.isValidElement(t)?a=t:a.right=t,o==="right"&&(s=a.right),o==="left"&&(s=a.left),s?i.createElement("div",{className:"".concat(r,"-extra-content"),ref:n},s):null});function Ef(e,n){var o=e.prefixCls,r=e.id,t=e.tabs,s=e.locale,a=e.mobile,f=e.moreIcon,l=f===void 0?"More":f,u=e.moreTransitionName,d=e.style,p=e.className,b=e.editable,w=e.tabBarGutter,x=e.rtl,S=e.removeAriaLabel,E=e.onTabClick,R=e.getPopupContainer,y=e.popupClassName,C=i.useState(!1),P=q(C,2),g=P[0],c=P[1],_=i.useState(null),v=q(_,2),h=v[0],I=v[1],m="".concat(r,"-more-popup"),T="".concat(o,"-dropdown"),k=h!==null?"".concat(m,"-").concat(h):null,O=s==null?void 0:s.dropdownAriaLabel;function D(N,A){N.preventDefault(),N.stopPropagation(),b.onEdit("remove",{key:A,event:N})}var U=i.createElement(Ln,{onClick:function(A){var K=A.key,G=A.domEvent;E(K,G),c(!1)},prefixCls:"".concat(T,"-menu"),id:m,tabIndex:-1,role:"listbox","aria-activedescendant":k,selectedKeys:[h],"aria-label":O!==void 0?O:"expanded dropdown"},t.map(function(N){var A=b&&N.closable!==!1&&!N.disabled;return i.createElement(Jn,{key:N.key,id:"".concat(m,"-").concat(N.key),role:"option","aria-controls":r&&"".concat(r,"-panel-").concat(N.key),disabled:N.disabled},i.createElement("span",null,N.label),A&&i.createElement("button",{type:"button","aria-label":S||"remove",tabIndex:0,className:"".concat(T,"-menu-item-remove"),onClick:function(G){G.stopPropagation(),D(G,N.key)}},N.closeIcon||b.removeIcon||"×"))}));function $(N){for(var A=t.filter(function(oe){return!oe.disabled}),K=A.findIndex(function(oe){return oe.key===h})||0,G=A.length,be=0;be<G;be+=1){K=(K+N+G)%G;var ye=A[K];if(!ye.disabled){I(ye.key);return}}}function W(N){var A=N.which;if(!g){[_e.DOWN,_e.SPACE,_e.ENTER].includes(A)&&(c(!0),N.preventDefault());return}switch(A){case _e.UP:$(-1),N.preventDefault();break;case _e.DOWN:$(1),N.preventDefault();break;case _e.ESC:c(!1);break;case _e.SPACE:case _e.ENTER:h!==null&&E(h,N);break}}i.useEffect(function(){var N=document.getElementById(k);N&&N.scrollIntoView&&N.scrollIntoView(!1)},[h]),i.useEffect(function(){g||I(null)},[g]);var X=M({},x?"marginRight":"marginLeft",w);t.length||(X.visibility="hidden",X.order=1);var ge=J(M({},"".concat(T,"-rtl"),x)),re=a?null:i.createElement(gf,{prefixCls:T,overlay:U,trigger:["hover"],visible:t.length?g:!1,transitionName:u,onVisibleChange:c,overlayClassName:J(ge,y),mouseEnterDelay:.1,mouseLeaveDelay:.1,getPopupContainer:R},i.createElement("button",{type:"button",className:"".concat(o,"-nav-more"),style:X,tabIndex:-1,"aria-hidden":"true","aria-haspopup":"listbox","aria-controls":m,id:"".concat(r,"-more"),"aria-expanded":g,onKeyDown:W},l));return i.createElement("div",{className:J("".concat(o,"-nav-operations"),p),style:d,ref:n},re,i.createElement(ra,{prefixCls:o,locale:s,editable:b}))}const If=i.memo(i.forwardRef(Ef),function(e,n){return n.tabMoving});function Rf(e){var n,o=e.prefixCls,r=e.id,t=e.active,s=e.tab,a=s.key,f=s.label,l=s.disabled,u=s.closeIcon,d=e.closable,p=e.renderWrapper,b=e.removeAriaLabel,w=e.editable,x=e.onClick,S=e.onFocus,E=e.style,R="".concat(o,"-tab"),y=w&&d!==!1&&!l;function C(c){l||x(c)}function P(c){c.preventDefault(),c.stopPropagation(),w.onEdit("remove",{key:a,event:c})}var g=i.createElement("div",{key:a,"data-node-key":ta(a),className:J(R,(n={},M(n,"".concat(R,"-with-remove"),y),M(n,"".concat(R,"-active"),t),M(n,"".concat(R,"-disabled"),l),n)),style:E,onClick:C},i.createElement("div",{role:"tab","aria-selected":t,id:r&&"".concat(r,"-tab-").concat(a),className:"".concat(R,"-btn"),"aria-controls":r&&"".concat(r,"-panel-").concat(a),"aria-disabled":l,tabIndex:l?null:0,onClick:function(_){_.stopPropagation(),C(_)},onKeyDown:function(_){[_e.SPACE,_e.ENTER].includes(_.which)&&(_.preventDefault(),C(_))},onFocus:S},f),y&&i.createElement("button",{type:"button","aria-label":b||"remove",tabIndex:0,className:"".concat(R,"-remove"),onClick:function(_){_.stopPropagation(),P(_)}},u||w.removeIcon||"×"));return p?p(g):g}var bn=function(n){var o=n.current||{},r=o.offsetWidth,t=r===void 0?0:r,s=o.offsetHeight,a=s===void 0?0:s;return[t,a]},Vn=function(n,o){return n[o?0:1]};function Pf(e,n){var o,r=i.useContext(Qn),t=r.prefixCls,s=r.tabs,a=e.className,f=e.style,l=e.id,u=e.animated,d=e.activeKey,p=e.rtl,b=e.extra,w=e.editable,x=e.locale,S=e.tabPosition,E=e.tabBarGutter,R=e.children,y=e.onTabClick,C=e.onTabScroll,P=i.useRef(),g=i.useRef(),c=i.useRef(),_=i.useRef(),v=i.useRef(),h=i.useRef(),I=i.useRef(),m=S==="top"||S==="bottom",T=Zr(0,function(Q,Y){m&&C&&C({direction:Q>Y?"left":"right"})}),k=q(T,2),O=k[0],D=k[1],U=Zr(0,function(Q,Y){!m&&C&&C({direction:Q>Y?"top":"bottom"})}),$=q(U,2),W=$[0],X=$[1],ge=i.useState([0,0]),re=q(ge,2),N=re[0],A=re[1],K=i.useState([0,0]),G=q(K,2),be=G[0],ye=G[1],oe=i.useState([0,0]),xe=q(oe,2),se=xe[0],H=xe[1],Te=i.useState([0,0]),Ee=q(Te,2),Ie=Ee[0],V=Ee[1],z=yf(new Map),L=q(z,2),ie=L[0],ke=L[1],Me=xf(s,ie,be[0]),he=Vn(N,m),we=Vn(be,m),ne=Vn(se,m),Ne=Vn(Ie,m),Ae=he<we+ne,ee=Ae?he-Ne:he-ne,Ke="".concat(t,"-nav-operations-hidden"),pe=0,fe=0;m&&p?(pe=0,fe=Math.max(0,we-ee)):(pe=Math.min(0,ee-we),fe=0);function Re(Q){return Q<pe?pe:Q>fe?fe:Q}var de=i.useRef(),Le=i.useState(),le=q(Le,2),ae=le[0],Se=le[1];function tn(){Se(Date.now())}function rn(){window.clearTimeout(de.current)}_f(_,function(Q,Y){function Ce(Pe,Ge){Pe(function(De){var fn=Re(De+Ge);return fn})}return Ae?(m?Ce(D,Q):Ce(X,Y),rn(),tn(),!0):!1}),i.useEffect(function(){return rn(),ae&&(de.current=window.setTimeout(function(){Se(0)},100)),rn},[ae]);var He=wf(Me,ee,m?O:W,we,ne,Ne,F(F({},e),{},{tabs:s})),on=q(He,2),an=on[0],Be=on[1],Je=yi(function(){var Q=arguments.length>0&&arguments[0]!==void 0?arguments[0]:d,Y=Me.get(Q)||{width:0,height:0,left:0,right:0,top:0};if(m){var Ce=O;p?Y.right<O?Ce=Y.right:Y.right+Y.width>O+ee&&(Ce=Y.right+Y.width-ee):Y.left<-O?Ce=-Y.left:Y.left+Y.width>-O+ee&&(Ce=-(Y.left+Y.width-ee)),X(0),D(Re(Ce))}else{var Pe=W;Y.top<-W?Pe=-Y.top:Y.top+Y.height>-W+ee&&(Pe=-(Y.top+Y.height-ee)),D(0),X(Re(Pe))}}),Fe={};S==="top"||S==="bottom"?Fe[p?"marginRight":"marginLeft"]=E:Fe.marginTop=E;var Qe=s.map(function(Q,Y){var Ce=Q.key;return i.createElement(Rf,{id:l,prefixCls:t,key:Ce,tab:Q,style:Y===0?void 0:Fe,closable:Q.closable,editable:w,active:Ce===d,renderWrapper:R,removeAriaLabel:x==null?void 0:x.removeAriaLabel,onClick:function(Ge){y(Ce,Ge)},onFocus:function(){Je(Ce),tn(),_.current&&(p||(_.current.scrollLeft=0),_.current.scrollTop=0)}})}),sn=function(){return ke(function(){var Y=new Map;return s.forEach(function(Ce){var Pe,Ge=Ce.key,De=(Pe=v.current)===null||Pe===void 0?void 0:Pe.querySelector('[data-node-key="'.concat(ta(Ge),'"]'));De&&Y.set(Ge,{width:De.offsetWidth,height:De.offsetHeight,left:De.offsetLeft,top:De.offsetTop})}),Y})};i.useEffect(function(){sn()},[s.map(function(Q){return Q.key}).join("_")]);var Oe=na(function(){var Q=bn(P),Y=bn(g),Ce=bn(c);A([Q[0]-Y[0]-Ce[0],Q[1]-Y[1]-Ce[1]]);var Pe=bn(I);H(Pe);var Ge=bn(h);V(Ge);var De=bn(v);ye([De[0]-Pe[0],De[1]-Pe[1]]),sn()}),B=s.slice(0,an),Z=s.slice(Be+1),ce=[].concat(Ze(B),Ze(Z)),qe=i.useState(),Ue=q(qe,2),nt=Ue[0],zn=Ue[1],ze=Me.get(d),Dn=i.useRef();function un(){Ye.cancel(Dn.current)}i.useEffect(function(){var Q={};return ze&&(m?(p?Q.right=ze.right:Q.left=ze.left,Q.width=ze.width):(Q.top=ze.top,Q.height=ze.height)),un(),Dn.current=Ye(function(){zn(Q)}),un},[ze,m,p]),i.useEffect(function(){Je()},[d,pe,fe,no(ze),no(Me),m]),i.useEffect(function(){Oe()},[p]);var We=!!ce.length,en="".concat(t,"-nav-wrap"),gn,wn,Cn,$n;return m?p?(wn=O>0,gn=O!==fe):(gn=O<0,wn=O!==pe):(Cn=W<0,$n=W!==pe),i.createElement(Gn,{onResize:Oe},i.createElement("div",{ref:Ri(n,P),role:"tablist",className:J("".concat(t,"-nav"),a),style:f,onKeyDown:function(){tn()}},i.createElement(to,{ref:g,position:"left",extra:b,prefixCls:t}),i.createElement("div",{className:J(en,(o={},M(o,"".concat(en,"-ping-left"),gn),M(o,"".concat(en,"-ping-right"),wn),M(o,"".concat(en,"-ping-top"),Cn),M(o,"".concat(en,"-ping-bottom"),$n),o)),ref:_},i.createElement(Gn,{onResize:Oe},i.createElement("div",{ref:v,className:"".concat(t,"-nav-list"),style:{transform:"translate(".concat(O,"px, ").concat(W,"px)"),transition:ae?"none":void 0}},Qe,i.createElement(ra,{ref:I,prefixCls:t,locale:x,editable:w,style:F(F({},Qe.length===0?void 0:Fe),{},{visibility:We?"hidden":null})}),i.createElement("div",{className:J("".concat(t,"-ink-bar"),M({},"".concat(t,"-ink-bar-animated"),u.inkBar)),style:nt})))),i.createElement(If,j({},e,{removeAriaLabel:x==null?void 0:x.removeAriaLabel,ref:h,prefixCls:t,tabs:ce,className:!We&&Ke,tabMoving:!!ae})),i.createElement(to,{ref:c,position:"right",extra:b,prefixCls:t})))}const ro=i.forwardRef(Pf);var Tf=["renderTabBar"],kf=["label","key"];function Nf(e){var n=e.renderTabBar,o=ve(e,Tf),r=i.useContext(Qn),t=r.tabs;if(n){var s=F(F({},o),{},{panes:t.map(function(a){var f=a.label,l=a.key,u=ve(a,kf);return i.createElement(ea,j({tab:f,key:l,tabKey:l},u))})});return n(s,ro)}return i.createElement(ro,o)}function Af(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{inkBar:!0,tabPane:!1},n;return e===!1?n={inkBar:!1,tabPane:!1}:e===!0?n={inkBar:!0,tabPane:!1}:n=F({inkBar:!0},yn(e)==="object"?e:{}),n.tabPaneMotion&&n.tabPane===void 0&&(n.tabPane=!0),!n.tabPaneMotion&&n.tabPane&&(n.tabPane=!1),n}var Of=["id","prefixCls","className","items","direction","activeKey","defaultActiveKey","editable","animated","tabPosition","tabBarGutter","tabBarStyle","tabBarExtraContent","locale","moreIcon","moreTransitionName","destroyInactiveTabPane","renderTabBar","onChange","onTabClick","onTabScroll","getPopupContainer","popupClassName"],oo=0;function Mf(e,n){var o,r=e.id,t=e.prefixCls,s=t===void 0?"rc-tabs":t,a=e.className,f=e.items,l=e.direction,u=e.activeKey,d=e.defaultActiveKey,p=e.editable,b=e.animated,w=e.tabPosition,x=w===void 0?"top":w,S=e.tabBarGutter,E=e.tabBarStyle,R=e.tabBarExtraContent,y=e.locale,C=e.moreIcon,P=e.moreTransitionName,g=e.destroyInactiveTabPane,c=e.renderTabBar,_=e.onChange,v=e.onTabClick,h=e.onTabScroll,I=e.getPopupContainer,m=e.popupClassName,T=ve(e,Of),k=i.useMemo(function(){return(f||[]).filter(function(z){return z&&yn(z)==="object"&&"key"in z})},[f]),O=l==="rtl",D=Af(b),U=i.useState(!1),$=q(U,2),W=$[0],X=$[1];i.useEffect(function(){X(Qa())},[]);var ge=_n(function(){var z;return(z=k[0])===null||z===void 0?void 0:z.key},{value:u,defaultValue:d}),re=q(ge,2),N=re[0],A=re[1],K=i.useState(function(){return k.findIndex(function(z){return z.key===N})}),G=q(K,2),be=G[0],ye=G[1];i.useEffect(function(){var z=k.findIndex(function(ie){return ie.key===N});if(z===-1){var L;z=Math.max(0,Math.min(be,k.length-1)),A((L=k[z])===null||L===void 0?void 0:L.key)}ye(z)},[k.map(function(z){return z.key}).join("_"),N,be]);var oe=_n(null,{value:r}),xe=q(oe,2),se=xe[0],H=xe[1];i.useEffect(function(){r||(H("rc-tabs-".concat(oo)),oo+=1)},[]);function Te(z,L){v==null||v(z,L);var ie=z!==N;A(z),ie&&(_==null||_(z))}var Ee={id:se,activeKey:N,animated:D,tabPosition:x,rtl:O,mobile:W},Ie,V=F(F({},Ee),{},{editable:p,locale:y,moreIcon:C,moreTransitionName:P,tabBarGutter:S,onTabClick:Te,onTabScroll:h,extra:R,style:E,panes:null,getPopupContainer:I,popupClassName:m});return i.createElement(Qn.Provider,{value:{tabs:k,prefixCls:s}},i.createElement("div",j({ref:n,id:r,className:J(s,"".concat(s,"-").concat(x),(o={},M(o,"".concat(s,"-mobile"),W),M(o,"".concat(s,"-editable"),p),M(o,"".concat(s,"-rtl"),O),o),a)},T),Ie,i.createElement(Nf,j({},V,{renderTabBar:c})),i.createElement(bf,j({destroyInactiveTabPane:g},Ee,{animated:D}))))}var qf=i.forwardRef(Mf),jf={motionAppear:!1,motionEnter:!0,motionLeave:!0};function Kf(e){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{inkBar:!0,tabPane:!1},o;return n===!1?o={inkBar:!1,tabPane:!1}:n===!0?o={inkBar:!0,tabPane:!0}:o=j({inkBar:!0},yn(n)==="object"?n:{}),o.tabPane&&(o.tabPaneMotion=j(j({},jf),{motionName:Ma(e,"switch")})),o}var Lf=function(e,n){var o={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&n.indexOf(r)<0&&(o[r]=e[r]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var t=0,r=Object.getOwnPropertySymbols(e);t<r.length;t++)n.indexOf(r[t])<0&&Object.prototype.propertyIsEnumerable.call(e,r[t])&&(o[r[t]]=e[r[t]]);return o};function zf(e){return e.filter(function(n){return n})}function Df(e,n){if(e)return e;var o=Ti(n).map(function(r){if(i.isValidElement(r)){var t=r.key,s=r.props,a=s||{},f=a.tab,l=Lf(a,["tab"]),u=j(j({key:String(t)},l),{label:f});return u}return null});return zf(o)}var $f=function(){return null},Bf=function(e,n){var o={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&n.indexOf(r)<0&&(o[r]=e[r]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var t=0,r=Object.getOwnPropertySymbols(e);t<r.length;t++)n.indexOf(r[t])<0&&Object.prototype.propertyIsEnumerable.call(e,r[t])&&(o[r[t]]=e[r[t]]);return o};function Vf(e){var n=e.type,o=e.className,r=e.size,t=e.onEdit,s=e.hideAdd,a=e.centered,f=e.addIcon,l=e.children,u=e.items,d=e.animated,p=Bf(e,["type","className","size","onEdit","hideAdd","centered","addIcon","children","items","animated"]),b=p.prefixCls,w=p.moreIcon,x=w===void 0?i.createElement(ws,null):w,S=i.useContext(Xn),E=S.getPrefixCls,R=S.direction,y=S.getPopupContainer,C=E("tabs",b),P;n==="editable-card"&&(P={onEdit:function(h,I){var m=I.key,T=I.event;t==null||t(h==="add"?T:m,h)},removeIcon:i.createElement(ja,null),addIcon:f||i.createElement(mf,null),showAdd:s!==!0});var g=E(),c=Df(u,l),_=Kf(C,d);return i.createElement(qa.Consumer,null,function(v){var h=r!==void 0?r:v;return i.createElement(qf,j({direction:R,getPopupContainer:y,moreTransitionName:"".concat(g,"-slide-up")},p,{items:c,className:J(M(M(M(M({},"".concat(C,"-").concat(h),h),"".concat(C,"-card"),["card","editable-card"].includes(n)),"".concat(C,"-editable-card"),n==="editable-card"),"".concat(C,"-centered"),a),o),editable:P,moreIcon:x,prefixCls:C,animated:_}))})}Vf.TabPane=$f;var it,io;function Ff(){if(io)return it;io=1;var e=yr();function n(){this.__data__=new e,this.size=0}return it=n,it}var at,ao;function Uf(){if(ao)return at;ao=1;function e(n){var o=this.__data__,r=o.delete(n);return this.size=o.size,r}return at=e,at}var st,so;function Wf(){if(so)return st;so=1;function e(n){return this.__data__.get(n)}return st=e,st}var ft,fo;function Gf(){if(fo)return ft;fo=1;function e(n){return this.__data__.has(n)}return ft=e,ft}var lt,lo;function Hf(){if(lo)return lt;lo=1;var e=yr(),n=ki(),o=Ka(),r=200;function t(s,a){var f=this.__data__;if(f instanceof e){var l=f.__data__;if(!n||l.length<r-1)return l.push([s,a]),this.size=++f.size,this;f=this.__data__=new o(l)}return f.set(s,a),this.size=f.size,this}return lt=t,lt}var ct,co;function Yf(){if(co)return ct;co=1;var e=yr(),n=Ff(),o=Uf(),r=Wf(),t=Gf(),s=Hf();function a(f){var l=this.__data__=new e(f);this.size=l.size}return a.prototype.clear=n,a.prototype.delete=o,a.prototype.get=r,a.prototype.has=t,a.prototype.set=s,ct=a,ct}var ut,uo;function Xf(){if(uo)return ut;uo=1;var e=cn(),n=e.Uint8Array;return ut=n,ut}var gt,go;function oa(){if(go)return gt;go=1;function e(n,o){for(var r=-1,t=o.length,s=n.length;++r<t;)n[s+r]=o[r];return n}return gt=e,gt}var pt,po;function ia(){if(po)return pt;po=1;var e=oa(),n=wr();function o(r,t,s){var a=t(r);return n(r)?a:e(a,s(r))}return pt=o,pt}var dt,mo;function Zf(){if(mo)return dt;mo=1;function e(n,o){for(var r=-1,t=n==null?0:n.length,s=0,a=[];++r<t;){var f=n[r];o(f,r,n)&&(a[s++]=f)}return a}return dt=e,dt}var mt,vo;function aa(){if(vo)return mt;vo=1;function e(){return[]}return mt=e,mt}var vt,bo;function Nr(){if(bo)return vt;bo=1;var e=Zf(),n=aa(),o=Object.prototype,r=o.propertyIsEnumerable,t=Object.getOwnPropertySymbols,s=t?function(a){return a==null?[]:(a=Object(a),e(t(a),function(f){return r.call(a,f)}))}:n;return vt=s,vt}var bt,xo;function Jf(){if(xo)return bt;xo=1;function e(n,o){for(var r=-1,t=Array(n);++r<n;)t[r]=o(r);return t}return bt=e,bt}var xt,ho;function Qf(){if(ho)return xt;ho=1;var e=Cr(),n=qn(),o="[object Arguments]";function r(t){return n(t)&&e(t)==o}return xt=r,xt}var ht,_o;function el(){if(_o)return ht;_o=1;var e=Qf(),n=qn(),o=Object.prototype,r=o.hasOwnProperty,t=o.propertyIsEnumerable,s=e(function(){return arguments}())?e:function(a){return n(a)&&r.call(a,"callee")&&!t.call(a,"callee")};return ht=s,ht}var kn={exports:{}},_t,yo;function nl(){if(yo)return _t;yo=1;function e(){return!1}return _t=e,_t}kn.exports;var wo;function sa(){return wo||(wo=1,function(e,n){var o=cn(),r=nl(),t=n&&!n.nodeType&&n,s=t&&!0&&e&&!e.nodeType&&e,a=s&&s.exports===t,f=a?o.Buffer:void 0,l=f?f.isBuffer:void 0,u=l||r;e.exports=u}(kn,kn.exports)),kn.exports}var yt,Co;function tl(){if(Co)return yt;Co=1;var e=9007199254740991,n=/^(?:0|[1-9]\d*)$/;function o(r,t){var s=typeof r;return t=t??e,!!t&&(s=="number"||s!="symbol"&&n.test(r))&&r>-1&&r%1==0&&r<t}return yt=o,yt}var wt,So;function fa(){if(So)return wt;So=1;var e=9007199254740991;function n(o){return typeof o=="number"&&o>-1&&o%1==0&&o<=e}return wt=n,wt}var Ct,Eo;function rl(){if(Eo)return Ct;Eo=1;var e=Cr(),n=fa(),o=qn(),r="[object Arguments]",t="[object Array]",s="[object Boolean]",a="[object Date]",f="[object Error]",l="[object Function]",u="[object Map]",d="[object Number]",p="[object Object]",b="[object RegExp]",w="[object Set]",x="[object String]",S="[object WeakMap]",E="[object ArrayBuffer]",R="[object DataView]",y="[object Float32Array]",C="[object Float64Array]",P="[object Int8Array]",g="[object Int16Array]",c="[object Int32Array]",_="[object Uint8Array]",v="[object Uint8ClampedArray]",h="[object Uint16Array]",I="[object Uint32Array]",m={};m[y]=m[C]=m[P]=m[g]=m[c]=m[_]=m[v]=m[h]=m[I]=!0,m[r]=m[t]=m[E]=m[s]=m[R]=m[a]=m[f]=m[l]=m[u]=m[d]=m[p]=m[b]=m[w]=m[x]=m[S]=!1;function T(k){return o(k)&&n(k.length)&&!!m[e(k)]}return Ct=T,Ct}var St,Io;function Ar(){if(Io)return St;Io=1;function e(n){return function(o){return n(o)}}return St=e,St}var Nn={exports:{}};Nn.exports;var Ro;function Or(){return Ro||(Ro=1,function(e,n){var o=La(),r=n&&!n.nodeType&&n,t=r&&!0&&e&&!e.nodeType&&e,s=t&&t.exports===r,a=s&&o.process,f=function(){try{var l=t&&t.require&&t.require("util").types;return l||a&&a.binding&&a.binding("util")}catch{}}();e.exports=f}(Nn,Nn.exports)),Nn.exports}var Et,Po;function ol(){if(Po)return Et;Po=1;var e=rl(),n=Ar(),o=Or(),r=o&&o.isTypedArray,t=r?n(r):e;return Et=t,Et}var It,To;function la(){if(To)return It;To=1;var e=Jf(),n=el(),o=wr(),r=sa(),t=tl(),s=ol(),a=Object.prototype,f=a.hasOwnProperty;function l(u,d){var p=o(u),b=!p&&n(u),w=!p&&!b&&r(u),x=!p&&!b&&!w&&s(u),S=p||b||w||x,E=S?e(u.length,String):[],R=E.length;for(var y in u)(d||f.call(u,y))&&!(S&&(y=="length"||w&&(y=="offset"||y=="parent")||x&&(y=="buffer"||y=="byteLength"||y=="byteOffset")||t(y,R)))&&E.push(y);return E}return It=l,It}var Rt,ko;function Mr(){if(ko)return Rt;ko=1;var e=Object.prototype;function n(o){var r=o&&o.constructor,t=typeof r=="function"&&r.prototype||e;return o===t}return Rt=n,Rt}var Pt,No;function il(){if(No)return Pt;No=1;var e=Mi(),n=e(Object.keys,Object);return Pt=n,Pt}var Tt,Ao;function al(){if(Ao)return Tt;Ao=1;var e=Mr(),n=il(),o=Object.prototype,r=o.hasOwnProperty;function t(s){if(!e(s))return n(s);var a=[];for(var f in Object(s))r.call(s,f)&&f!="constructor"&&a.push(f);return a}return Tt=t,Tt}var kt,Oo;function ca(){if(Oo)return kt;Oo=1;var e=za(),n=fa();function o(r){return r!=null&&n(r.length)&&!e(r)}return kt=o,kt}var Nt,Mo;function qr(){if(Mo)return Nt;Mo=1;var e=la(),n=al(),o=ca();function r(t){return o(t)?e(t):n(t)}return Nt=r,Nt}var At,qo;function sl(){if(qo)return At;qo=1;var e=ia(),n=Nr(),o=qr();function r(t){return e(t,o,n)}return At=r,At}var Ot,jo;function fl(){if(jo)return Ot;jo=1;var e=jn(),n=cn(),o=e(n,"DataView");return Ot=o,Ot}var Mt,Ko;function ll(){if(Ko)return Mt;Ko=1;var e=jn(),n=cn(),o=e(n,"Promise");return Mt=o,Mt}var qt,Lo;function cl(){if(Lo)return qt;Lo=1;var e=jn(),n=cn(),o=e(n,"Set");return qt=o,qt}var jt,zo;function ul(){if(zo)return jt;zo=1;var e=jn(),n=cn(),o=e(n,"WeakMap");return jt=o,jt}var Kt,Do;function jr(){if(Do)return Kt;Do=1;var e=fl(),n=ki(),o=ll(),r=cl(),t=ul(),s=Cr(),a=Da(),f="[object Map]",l="[object Object]",u="[object Promise]",d="[object Set]",p="[object WeakMap]",b="[object DataView]",w=a(e),x=a(n),S=a(o),E=a(r),R=a(t),y=s;return(e&&y(new e(new ArrayBuffer(1)))!=b||n&&y(new n)!=f||o&&y(o.resolve())!=u||r&&y(new r)!=d||t&&y(new t)!=p)&&(y=function(C){var P=s(C),g=P==l?C.constructor:void 0,c=g?a(g):"";if(c)switch(c){case w:return b;case x:return f;case S:return u;case E:return d;case R:return p}return P}),Kt=y,Kt}var Lt,$o;function gl(){if($o)return Lt;$o=1;function e(n,o){for(var r=-1,t=n==null?0:n.length;++r<t&&o(n[r],r,n)!==!1;);return n}return Lt=e,Lt}var zt,Bo;function pl(){if(Bo)return zt;Bo=1;var e=jn(),n=function(){try{var o=e(Object,"defineProperty");return o({},"",{}),o}catch{}}();return zt=n,zt}var Dt,Vo;function ua(){if(Vo)return Dt;Vo=1;var e=pl();function n(o,r,t){r=="__proto__"&&e?e(o,r,{configurable:!0,enumerable:!0,value:t,writable:!0}):o[r]=t}return Dt=n,Dt}var $t,Fo;function ga(){if(Fo)return $t;Fo=1;var e=ua(),n=$a(),o=Object.prototype,r=o.hasOwnProperty;function t(s,a,f){var l=s[a];(!(r.call(s,a)&&n(l,f))||f===void 0&&!(a in s))&&e(s,a,f)}return $t=t,$t}var Bt,Uo;function et(){if(Uo)return Bt;Uo=1;var e=ga(),n=ua();function o(r,t,s,a){var f=!s;s||(s={});for(var l=-1,u=t.length;++l<u;){var d=t[l],p=a?a(s[d],r[d],d,s,r):void 0;p===void 0&&(p=r[d]),f?n(s,d,p):e(s,d,p)}return s}return Bt=o,Bt}var Vt,Wo;function dl(){if(Wo)return Vt;Wo=1;var e=et(),n=qr();function o(r,t){return r&&e(t,n(t),r)}return Vt=o,Vt}var Ft,Go;function ml(){if(Go)return Ft;Go=1;function e(n){var o=[];if(n!=null)for(var r in Object(n))o.push(r);return o}return Ft=e,Ft}var Ut,Ho;function vl(){if(Ho)return Ut;Ho=1;var e=Sr(),n=Mr(),o=ml(),r=Object.prototype,t=r.hasOwnProperty;function s(a){if(!e(a))return o(a);var f=n(a),l=[];for(var u in a)u=="constructor"&&(f||!t.call(a,u))||l.push(u);return l}return Ut=s,Ut}var Wt,Yo;function Kr(){if(Yo)return Wt;Yo=1;var e=la(),n=vl(),o=ca();function r(t){return o(t)?e(t,!0):n(t)}return Wt=r,Wt}var Gt,Xo;function bl(){if(Xo)return Gt;Xo=1;var e=et(),n=Kr();function o(r,t){return r&&e(t,n(t),r)}return Gt=o,Gt}var An={exports:{}};An.exports;var Zo;function xl(){return Zo||(Zo=1,function(e,n){var o=cn(),r=n&&!n.nodeType&&n,t=r&&!0&&e&&!e.nodeType&&e,s=t&&t.exports===r,a=s?o.Buffer:void 0,f=a?a.allocUnsafe:void 0;function l(u,d){if(d)return u.slice();var p=u.length,b=f?f(p):new u.constructor(p);return u.copy(b),b}e.exports=l}(An,An.exports)),An.exports}var Ht,Jo;function hl(){if(Jo)return Ht;Jo=1;function e(n,o){var r=-1,t=n.length;for(o||(o=Array(t));++r<t;)o[r]=n[r];return o}return Ht=e,Ht}var Yt,Qo;function _l(){if(Qo)return Yt;Qo=1;var e=et(),n=Nr();function o(r,t){return e(r,n(r),t)}return Yt=o,Yt}var Xt,ei;function pa(){if(ei)return Xt;ei=1;var e=oa(),n=qi(),o=Nr(),r=aa(),t=Object.getOwnPropertySymbols,s=t?function(a){for(var f=[];a;)e(f,o(a)),a=n(a);return f}:r;return Xt=s,Xt}var Zt,ni;function yl(){if(ni)return Zt;ni=1;var e=et(),n=pa();function o(r,t){return e(r,n(r),t)}return Zt=o,Zt}var Jt,ti;function wl(){if(ti)return Jt;ti=1;var e=ia(),n=pa(),o=Kr();function r(t){return e(t,o,n)}return Jt=r,Jt}var Qt,ri;function Cl(){if(ri)return Qt;ri=1;var e=Object.prototype,n=e.hasOwnProperty;function o(r){var t=r.length,s=new r.constructor(t);return t&&typeof r[0]=="string"&&n.call(r,"index")&&(s.index=r.index,s.input=r.input),s}return Qt=o,Qt}var er,oi;function Lr(){if(oi)return er;oi=1;var e=Xf();function n(o){var r=new o.constructor(o.byteLength);return new e(r).set(new e(o)),r}return er=n,er}var nr,ii;function Sl(){if(ii)return nr;ii=1;var e=Lr();function n(o,r){var t=r?e(o.buffer):o.buffer;return new o.constructor(t,o.byteOffset,o.byteLength)}return nr=n,nr}var tr,ai;function El(){if(ai)return tr;ai=1;var e=/\w*$/;function n(o){var r=new o.constructor(o.source,e.exec(o));return r.lastIndex=o.lastIndex,r}return tr=n,tr}var rr,si;function Il(){if(si)return rr;si=1;var e=Ba(),n=e?e.prototype:void 0,o=n?n.valueOf:void 0;function r(t){return o?Object(o.call(t)):{}}return rr=r,rr}var or,fi;function Rl(){if(fi)return or;fi=1;var e=Lr();function n(o,r){var t=r?e(o.buffer):o.buffer;return new o.constructor(t,o.byteOffset,o.length)}return or=n,or}var ir,li;function Pl(){if(li)return ir;li=1;var e=Lr(),n=Sl(),o=El(),r=Il(),t=Rl(),s="[object Boolean]",a="[object Date]",f="[object Map]",l="[object Number]",u="[object RegExp]",d="[object Set]",p="[object String]",b="[object Symbol]",w="[object ArrayBuffer]",x="[object DataView]",S="[object Float32Array]",E="[object Float64Array]",R="[object Int8Array]",y="[object Int16Array]",C="[object Int32Array]",P="[object Uint8Array]",g="[object Uint8ClampedArray]",c="[object Uint16Array]",_="[object Uint32Array]";function v(h,I,m){var T=h.constructor;switch(I){case w:return e(h);case s:case a:return new T(+h);case x:return n(h,m);case S:case E:case R:case y:case C:case P:case g:case c:case _:return t(h,m);case f:return new T;case l:case p:return new T(h);case u:return o(h);case d:return new T;case b:return r(h)}}return ir=v,ir}var ar,ci;function Tl(){if(ci)return ar;ci=1;var e=Sr(),n=Object.create,o=function(){function r(){}return function(t){if(!e(t))return{};if(n)return n(t);r.prototype=t;var s=new r;return r.prototype=void 0,s}}();return ar=o,ar}var sr,ui;function kl(){if(ui)return sr;ui=1;var e=Tl(),n=qi(),o=Mr();function r(t){return typeof t.constructor=="function"&&!o(t)?e(n(t)):{}}return sr=r,sr}var fr,gi;function Nl(){if(gi)return fr;gi=1;var e=jr(),n=qn(),o="[object Map]";function r(t){return n(t)&&e(t)==o}return fr=r,fr}var lr,pi;function Al(){if(pi)return lr;pi=1;var e=Nl(),n=Ar(),o=Or(),r=o&&o.isMap,t=r?n(r):e;return lr=t,lr}var cr,di;function Ol(){if(di)return cr;di=1;var e=jr(),n=qn(),o="[object Set]";function r(t){return n(t)&&e(t)==o}return cr=r,cr}var ur,mi;function Ml(){if(mi)return ur;mi=1;var e=Ol(),n=Ar(),o=Or(),r=o&&o.isSet,t=r?n(r):e;return ur=t,ur}var gr,vi;function ql(){if(vi)return gr;vi=1;var e=Yf(),n=gl(),o=ga(),r=dl(),t=bl(),s=xl(),a=hl(),f=_l(),l=yl(),u=sl(),d=wl(),p=jr(),b=Cl(),w=Pl(),x=kl(),S=wr(),E=sa(),R=Al(),y=Sr(),C=Ml(),P=qr(),g=Kr(),c=1,_=2,v=4,h="[object Arguments]",I="[object Array]",m="[object Boolean]",T="[object Date]",k="[object Error]",O="[object Function]",D="[object GeneratorFunction]",U="[object Map]",$="[object Number]",W="[object Object]",X="[object RegExp]",ge="[object Set]",re="[object String]",N="[object Symbol]",A="[object WeakMap]",K="[object ArrayBuffer]",G="[object DataView]",be="[object Float32Array]",ye="[object Float64Array]",oe="[object Int8Array]",xe="[object Int16Array]",se="[object Int32Array]",H="[object Uint8Array]",Te="[object Uint8ClampedArray]",Ee="[object Uint16Array]",Ie="[object Uint32Array]",V={};V[h]=V[I]=V[K]=V[G]=V[m]=V[T]=V[be]=V[ye]=V[oe]=V[xe]=V[se]=V[U]=V[$]=V[W]=V[X]=V[ge]=V[re]=V[N]=V[H]=V[Te]=V[Ee]=V[Ie]=!0,V[k]=V[O]=V[A]=!1;function z(L,ie,ke,Me,he,we){var ne,Ne=ie&c,Ae=ie&_,ee=ie&v;if(ke&&(ne=he?ke(L,Me,he,we):ke(L)),ne!==void 0)return ne;if(!y(L))return L;var Ke=S(L);if(Ke){if(ne=b(L),!Ne)return a(L,ne)}else{var pe=p(L),fe=pe==O||pe==D;if(E(L))return s(L,Ne);if(pe==W||pe==h||fe&&!he){if(ne=Ae||fe?{}:x(L),!Ne)return Ae?l(L,t(ne,L)):f(L,r(ne,L))}else{if(!V[pe])return he?L:{};ne=w(L,pe,Ne)}}we||(we=new e);var Re=we.get(L);if(Re)return Re;we.set(L,ne),C(L)?L.forEach(function(le){ne.add(z(le,ie,ke,le,L,we))}):R(L)&&L.forEach(function(le,ae){ne.set(ae,z(le,ie,ke,ae,L,we))});var de=ee?Ae?d:u:Ae?g:P,Le=Ke?void 0:de(L);return n(Le||L,function(le,ae){Le&&(ae=le,le=L[ae]),o(ne,ae,z(le,ie,ke,ae,L,we))}),ne}return gr=z,gr}var pr,bi;function jl(){if(bi)return pr;bi=1;var e=ql(),n=1,o=4;function r(t){return e(t,n|o)}return pr=r,pr}var Kl=jl();const xi=Ni(Kl);var Ll=({className:e="",...n})=>hn.createElement(Ya,{className:e,component:ns,...n}),Gl=Ll,Hl=()=>{let[e,n]=i.useState(Va()),{setPaymentPassword:o,userInfo:r,modalOptions:t,showAccountTipModal:s}=Ai();return i.useEffect(()=>{var a;n(!!((a=r==null?void 0:r.security_account)!=null&&a.has_set_payment_password))},[r]),{hasSetPaymentPassword:e,setPaymentPassword:o,showSetPaymentPasswordOrConfirm:a=>{var f,l,u,d;e?a():((f=t.promptSettingConfig)==null?void 0:f.promptPaymentPasswordSettingWhenSign)===2||((l=t.promptSettingConfig)==null?void 0:l.promptPaymentPasswordSettingWhenSign)===3?s({visible:!0,confirm:a}):((u=t.promptSettingConfig)!=null&&u.promptPaymentPasswordSettingWhenSign||Fa((d=t.promptSettingConfig)==null?void 0:d.promptPaymentPasswordSettingWhenSign))&&!Ua($r.PN_OPEN_SET_PAYMENT_PASSWORD)?(Wa($r.PN_OPEN_SET_PAYMENT_PASSWORD,"1"),s({visible:!0,confirm:a})):a()}}},Yl=`.info-sign {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 290px;
  height: 100%;
}
.info-sign .pending-warning-modal {
  top: 100px;
  display: block;
  margin: auto;
}
.info-sign .pending-warning-modal .ant-modal-body {
  padding: 18px;
}
.info-sign .pending-warning-modal .ant-modal-confirm-btns {
  display: none;
}
.info-sign .pending-warning-modal .content {
  margin-top: 26px;
  font-weight: 500;
  font-size: 16px;
  line-height: 20px;
  text-align: center;
  color: var(--text-color);
}
.info-sign .pending-warning-modal .anticon-exclamation-circle {
  display: none;
}
.info-sign .pending-warning-modal .anticon-close {
  color: var(--secondary-text-color);
}
.info-sign .pending-warning-modal .footer-btns {
  column-gap: 18px;
  display: flex;
  justify-content: flex-end;
  margin-top: 30px;
}
.info-sign .pending-warning-modal .footer-btns .ant-btn {
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  height: 47px;
  font-weight: 500;
  font-size: 17px;
  line-height: 22px;
  text-align: center;
  color: var(--background-color);
}
.info-sign .pending-warning-modal .footer-btns .ant-btn:first-child {
  color: var(--secondary-btn-color);
  background-color: var(--secondary-btn-background-color);
}
.info-sign .pending-warning-modal .footer-btns .ant-btn:hover,
.info-sign .pending-warning-modal .footer-btns .ant-btn:focus,
.info-sign .pending-warning-modal .footer-btns .ant-btn:active {
  color: var(--primary-btn-color);
  background-color: var(--primary-btn-background-color);
}
.info-sign .continue-btn:hover {
  color: var(--secondary-btn-color) !important;
  background-color: var(--secondary-btn-background-color) !important;
}
.info-sign .has-payment-password {
  z-index: 100;
  top: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: var(--set-payment-password-bar-height);
  padding: 0 16px;
  padding-right: 52px;
  background-color: var(--tips-background-color);
  opacity: 1;
}
.info-sign .has-payment-password .has-payment-password-icon {
  width: 18px;
  height: 18px;
  border: 1px solid #f7af5d;
  border-radius: 50%;
  overflow: hidden;
  background-image: var(--icon-warning);
  background-size: 100% auto;
  background-repeat: no-repeat;
  background-color: white;
}
.info-sign .has-payment-password .has-payment-password-tip {
  flex: 1;
  margin: 0 8px;
  font-weight: 400;
  font-size: 12px;
  line-height: 15px;
  text-align: left;
  color: var(--text-color);
}
@media screen and (max-width: 350px) {
  .info-sign .has-payment-password .has-payment-password-tip {
    letter-spacing: -1px;
  }
}
.info-sign .has-payment-password .has-payment-password-set {
  min-width: 44px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: 14px;
  line-height: 22px;
  text-align: center;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  cursor: pointer;
}
.info-sign .has-payment-password .has-payment-password-set:hover {
  opacity: var(--hover-opacity);
}
@media (max-width: 600px) {
  .info-sign .has-payment-password {
    padding-right: 16px;
    margin-top: 15px;
  }
  .info-sign .has-payment-password[data-telegram='true'] {
    padding-right: 52px !important;
    margin-top: 0 !important;
  }
}
.info-sign .ant-tabs {
  width: calc(100% - 36px);
  min-width: 230px;
}
.info-sign .ant-tabs-nav .ant-tabs-tab {
  padding-bottom: 4px;
  color: var(--secondary-text-color);
}
.info-sign .ant-tabs-nav .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
  color: var(--text-color);
}
.info-sign .ant-tabs-nav::before {
  display: none;
}
.info-sign .ant-tabs-nav .ant-tabs-nav-wrap .ant-tabs-ink-bar {
  background: var(--text-color);
}
.info-sign .scroll-part {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-top: 16px;
  padding-bottom: 10px;
  margin: 0;
  overflow: auto;
}
.info-sign .scroll-part .top-menu-list {
  position: absolute;
  z-index: 99;
  top: 12px;
  left: 15px;
  column-gap: 5px;
  display: flex;
  justify-content: flex-start;
}
.info-sign .scroll-part .top-menu-list .item {
  cursor: pointer;
}
.info-sign .scroll-part .top-menu-list .item .anticon {
  font-size: 26px;
}
.info-sign .scroll-part .top-menu-list .item .ant-badge-dot {
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border: none;
  box-shadow: none;
}
.info-sign .scroll-part .menu-entry {
  position: absolute;
  z-index: 99;
  top: 16px;
  left: 15px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
}
.info-sign .scroll-part .menu-entry .menu-icon {
  cursor: pointer;
}
.info-sign .scroll-part .menu-entry .wallet-entry {
  margin-left: 8px;
  font-size: 28px;
}
.info-sign .scroll-part .menu-entry .ant-popover {
  padding: 0;
}
.info-sign .scroll-part .menu-entry .ant-popover .ant-popover-arrow {
  display: none;
}
.info-sign .scroll-part .menu-entry .ant-popover .ant-popover-inner {
  border-radius: var(--primary-btn-border-radius);
  background: var(--modal-background-color);
}
.info-sign .scroll-part .menu-entry .ant-popover .menu-list {
  display: flex;
  flex-direction: column;
}
.info-sign .scroll-part .menu-entry .ant-popover .menu-list .item {
  position: relative;
  display: flex;
  align-items: center;
  font-size: 14px;
  line-height: 2;
  white-space: nowrap;
  cursor: pointer;
}
.info-sign .scroll-part .menu-entry .ant-popover .menu-list .item .ant-badge {
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .menu-entry .ant-popover .menu-list .item .ant-badge .ant-badge-dot {
  top: -1px;
  right: -4px;
}
.info-sign .scroll-part .menu-entry .ant-badge {
  column-gap: 8px;
  display: flex;
  align-items: center;
}
.info-sign .scroll-part .menu-entry .ant-badge .ant-badge-dot {
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border: none;
  box-shadow: none;
}
.info-sign .scroll-part .menu-popover-overlay .ant-popover-inner-content {
  padding: 0;
}
.info-sign .scroll-part .menu-popover-overlay .ant-popover-inner-content .menu-list {
  padding-top: 6px;
  padding-bottom: 6px;
}
.info-sign .scroll-part .menu-popover-overlay .ant-popover-inner-content .menu-list .item {
  height: 45px;
  padding: 0 17px;
  border-bottom: 1px solid var(--keyword-border-color);
  font-weight: 500;
  font-size: 14px;
  line-height: 45px;
  color: #000;
}
.info-sign .scroll-part .menu-popover-overlay .ant-popover-inner-content .menu-list .item:last-child {
  border-bottom: none;
}
.info-sign .scroll-part .menu-popover-overlay .ant-popover-inner-content .menu-list .item .anticon {
  font-size: 26px;
  color: var(--text-color);
}
.info-sign .scroll-part .info-title {
  height: 19px;
  padding-top: 0;
  margin-top: 10px;
  margin-bottom: 2px;
  font-weight: 400;
  font-size: 12px;
  text-align: center;
  color: var(--text-color);
}
.info-sign .scroll-part .info-title img {
  width: 13px;
  height: 13px;
  margin-right: 4px;
  margin-bottom: 3px;
}
.info-sign .scroll-part .info-address {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 23px;
  padding: 0 5px 0 8px;
  margin-top: 5px;
  border-radius: var(--primary-btn-border-radius);
  font-size: 12px;
  line-height: 23px;
  color: var(--secondary-text-color);
  background: var(--tag-background-color);
  cursor: pointer;
}
.info-sign .scroll-part .info-address .copy-icon {
  position: relative;
  width: 14px;
  height: 100%;
  margin-left: 5px;
}
.info-sign .scroll-part .info-address .copy-icon .anticon {
  position: absolute;
  top: 5px;
}
.info-sign .scroll-part .info-request {
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 20px;
  max-height: 20px;
  padding-top: 0;
  font-weight: 500;
  font-size: 20px;
  text-align: center;
  color: var(--text-color);
  gap: 6px;
}
.info-sign .scroll-part .info-request .aa-icon {
  display: flex;
  align-items: center;
}
.info-sign .scroll-part .info-request .aa-icon .ant-image {
  width: 22px;
  height: 22px;
}
.info-sign .scroll-part .info-request .aa-icon .ant-image img {
  position: absolute;
  left: 0;
  top: 0;
}
.info-sign .scroll-part .info-request .aa-tag {
  padding: 0 4px;
  margin-right: 5px;
  border-radius: 10px;
  font-weight: bold;
  font-size: 12px;
  color: var(--background-color);
  background-color: var(--text-color);
}
.info-sign .scroll-part .info-des {
  max-width: 300px;
  margin: 9px 0;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.2;
  text-align: center;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .apart-line {
  display: none;
  width: 100%;
  border-top: 1px solid var(--card-unclickable-border-color);
}
.info-sign .scroll-part .balance-change {
  width: 100%;
  min-width: 230px;
  padding: 15px 12px;
  border: 1px solid var(--card-unclickable-border-color);
  border-width: 1px;
  border-style: solid;
  border-radius: var(--card-border-radius);
  background: var(--card-unclickable-background-color);
}
.info-sign .scroll-part .balance-change .title {
  padding-bottom: 1px;
  font-weight: 500;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .balance-change .change-body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.info-sign .scroll-part .balance-change .change-body .change-title {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-weight: 400;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .balance-change .change-body .change-title .change-val {
  font-weight: 500;
  font-size: 14px;
  color: var(--green-color);
}
.info-sign .scroll-part .balance-change .change-body .mt20 {
  margin-top: 20px;
}
.info-sign .scroll-part .balance-change .change-body .message-text {
  font-weight: 400;
  font-size: 14px;
  line-height: 24px;
  color: var(--text-color);
}
.info-sign .scroll-part .from-to {
  width: 100%;
  min-width: 230px;
  padding: 20px 12px;
  margin-top: 15px;
  border: none;
  border-radius: var(--card-border-radius);
  font-weight: 400;
  font-size: 14px;
  color: var(--text-color);
  background: var(--card-unclickable-background-color);
}
.info-sign .scroll-part .from-to .address-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.info-sign .scroll-part .from-to .mt10 {
  margin-top: 10px;
}
.info-sign .scroll-part .no-gas-fee {
  width: 100%;
  min-width: 230px;
  padding: 20px 12px;
  margin-top: 15px;
  border-radius: var(--card-border-radius);
  font-weight: 400;
  font-size: 14px;
  color: var(--text-color);
  background: rgba(234, 67, 53, 0.09);
}
.info-sign .scroll-part .no-gas-fee img {
  width: 18.5px;
  height: 18.5px;
  margin-top: 3px;
  margin-right: 10px;
}
.info-sign .scroll-part .no-gas-fee .no-title {
  font-weight: 500;
}
.info-sign .scroll-part .no-gas-fee .no-warning {
  display: flex;
  padding-bottom: 9px;
  margin-top: 10px;
  border-bottom: 1px solid var(--card-divider-color);
  line-height: 15px;
}
.info-sign .scroll-part .no-gas-fee .data-title {
  margin-top: 15px;
  font-weight: bold;
}
.info-sign .scroll-part .no-gas-fee .data-item {
  margin-top: 10px;
  line-height: 14px;
}
.info-sign .scroll-part .net-fee {
  width: 100%;
  min-width: 230px;
  padding: 15px 12px;
  margin-top: 15px;
  border: 1px solid var(--card-unclickable-border-color);
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
  cursor: pointer;
}
.info-sign .scroll-part .net-fee .title {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .net-fee .title .fee-val {
  font-weight: 400;
  font-size: 16px;
  color: var(--text-color);
}
.info-sign .scroll-part .net-fee .evm-fee {
  font-weight: 400;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .net-fee .evm-fee .fee-title {
  font-weight: 500;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-title span {
  font-weight: 500;
  font-size: 14px;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row img {
  width: 9.19px;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .approximately {
  font-weight: 400;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .fee-standard {
  width: 70px;
  margin-right: 10px;
  font-weight: normal;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .fee-time {
  width: 70px;
  margin-right: 19.19px;
  font-weight: 500;
  color: var(--green-color);
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .row-right {
  display: flex;
  align-items: center;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .row-right .right-icon {
  width: 9.19px;
  margin-left: 15px;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .fee-right {
  display: flex;
  text-align: right;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .fee-right .arrow-right-icon {
  color: var(--text-color);
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .fee-right .arrow-right-icon svg {
  width: 13px;
  height: 13px;
}
.info-sign .scroll-part .net-fee .evm-fee .fee-row .right-time {
  margin-right: 55px;
  font-weight: bold;
  font-size: 12px;
  color: var(--green-color);
}
.info-sign .scroll-part .total {
  width: 100%;
  min-width: 230px;
  padding: 15px 12px;
  margin-top: 15px;
  border: 1px solid var(--card-unclickable-border-color);
  border-radius: var(--card-border-radius);
  font-weight: 400;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .total .total-title {
  font-weight: bold;
}
.info-sign .scroll-part .total .mt8 {
  margin-top: 8px;
}
.info-sign .scroll-part .total .total-content span {
  font-weight: 400;
  word-break: break-all;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .show-btn {
  margin-top: 4px;
  font-weight: 500;
  font-size: 14px;
}
.info-sign .scroll-part .program-details {
  margin-top: 30px;
  font-weight: 500;
  text-align: center;
  color: var(--text-color);
}
.info-sign .scroll-part .inner-instruction {
  width: 100%;
  min-width: 230px;
  margin-bottom: 15px;
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item {
  margin-top: 0;
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item {
  padding: 13px 11px;
  border: none;
  border-width: 1px;
  border-style: solid;
  border-color: var(--card-unclickable-border-color) !important;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color) !important;
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item .item-0 {
  font-weight: 500;
  font-size: 14px;
  line-height: 24px;
  word-break: break-all;
  color: var(--text-color);
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item .mt10 {
  margin-top: 10px;
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item .mt15 {
  margin-top: 15px;
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item .item-1 {
  display: flex;
  justify-content: space-between;
  font-weight: 400;
  font-size: 14px;
  line-height: 19px;
  color: var(--text-color);
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item .item-1 span {
  max-width: 220px;
  font-weight: 400;
  font-size: 14px;
  line-height: 19px;
  text-align: right;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .inner-instruction .inner-content .content-item .item .item-1 .data {
  max-width: calc(85 * var(--vw));
  font-weight: 400;
  font-size: 14px;
  line-height: 19px;
  text-align: left;
  word-wrap: break-word;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .sign-message {
  width: calc(100% - 36px);
  min-width: 230px;
  padding: 0;
  margin-top: 18px;
  border: none;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
}
.info-sign .scroll-part .sign-message .s-row {
  display: flex;
  margin-top: 6px;
  margin-bottom: 6px;
  font-size: 14px;
  line-height: 1.3;
  color: var(--text-color);
}
.info-sign .scroll-part .sign-message .s-row[data-index='0'] ::after {
  display: none;
}
.info-sign .scroll-part .sign-message .s-row [data-type='title'],
.info-sign .scroll-part .sign-message .s-row [data-type='index'],
.info-sign .scroll-part .sign-message .s-row .label[data-type='title'],
.info-sign .scroll-part .sign-message .s-row .title[data-type='title'],
.info-sign .scroll-part .sign-message .s-row .value[data-type='index'] {
  position: relative;
  font-weight: bold;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign .scroll-part .sign-message .s-row .label {
  font-weight: 400;
  font-size: 14px;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .sign-message .s-row .value {
  flex: 1;
  overflow: hidden;
  font-weight: 400;
  font-size: 14px;
  word-break: break-all;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .sign-message .message {
  position: relative;
  max-height: calc(var(--doc-height) - 300px);
  padding: 8px 12px;
  overflow: auto;
  font-weight: 400;
  font-size: 14px;
  line-height: 24px;
  word-wrap: break-word;
  color: var(--secondary-text-color);
}
.info-sign .scroll-part .sign-message .message .personal-message {
  position: relative;
}
.info-sign .scroll-part .sign-message .message pre {
  padding-bottom: 2px;
}
.info-sign .scroll-part .sign-message .message.no-password-tip {
  max-height: calc(var(--doc-height) - 300px - var(--set-payment-password-bar-height) - var(--risk-bar-height)) !important;
}
.info-sign .btn-box {
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-width: 290px;
  height: var(--sign-bottom-menu-height);
  background: var(--theme-background-color);
  box-shadow: 0 -2px 3px 1px rgba(0, 0, 0, 0.08);
}
.info-sign .btn-box > div {
  display: flex;
  width: calc(100% - 36px);
  gap: 18px;
}
.info-sign .btn-box .footer-box {
  margin-top: 10px;
}
.info-sign .btn-box .btn-cancel {
  flex: 1;
  max-width: calc(300 * var(--vw));
  height: 47px;
  padding: 0;
  margin-top: 10px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: 17px;
  text-align: center;
  color: var(--secondary-btn-color);
  background: var(--secondary-btn-background-color);
}
.info-sign .btn-box .btn-cancel:hover {
  opacity: var(--hover-opacity);
}
.info-sign .btn-box .btn-cancel span {
  font-weight: 500;
}
.info-sign .btn-box .btn-approve {
  flex: 1;
  max-width: calc(300 * var(--vw));
  height: 47px;
  padding: 0;
  margin-top: 10px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: var(--primary-btn-font-size);
  text-align: center;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
.info-sign .btn-box .btn-approve:hover {
  opacity: var(--hover-opacity);
}
.info-sign .btn-box .btn-approve img {
  width: 12.75px;
  height: 18.29px;
  margin-right: 12px;
}
.info-sign.info-sign-erc20_transfer .fee-row,
.info-sign.info-sign-erc1155_transfer .fee-row,
.info-sign.info-sign-erc20_approve .fee-row,
.info-sign.info-sign-native_transfer .fee-row,
.info-sign.info-sign-erc721_transfer .fee-row,
.info-sign.info-sign-seaport_cancel_order .fee-row,
.info-sign.info-sign-seaport_nft_listing .fee-row,
.info-sign.info-sign-seaport_fulfill_order .fee-row {
  align-items: center;
}
.info-sign.info-sign-erc20_transfer .item4 .flex-sp-row,
.info-sign.info-sign-erc1155_transfer .item4 .flex-sp-row,
.info-sign.info-sign-erc20_approve .item4 .flex-sp-row,
.info-sign.info-sign-native_transfer .item4 .flex-sp-row,
.info-sign.info-sign-erc721_transfer .item4 .flex-sp-row,
.info-sign.info-sign-seaport_cancel_order .item4 .flex-sp-row,
.info-sign.info-sign-seaport_nft_listing .item4 .flex-sp-row,
.info-sign.info-sign-seaport_fulfill_order .item4 .flex-sp-row {
  flex-wrap: wrap;
}
.info-sign.info-sign-erc20_transfer .item4 .flex-sp-row .left,
.info-sign.info-sign-erc1155_transfer .item4 .flex-sp-row .left,
.info-sign.info-sign-erc20_approve .item4 .flex-sp-row .left,
.info-sign.info-sign-native_transfer .item4 .flex-sp-row .left,
.info-sign.info-sign-erc721_transfer .item4 .flex-sp-row .left,
.info-sign.info-sign-seaport_cancel_order .item4 .flex-sp-row .left,
.info-sign.info-sign-seaport_nft_listing .item4 .flex-sp-row .left,
.info-sign.info-sign-seaport_fulfill_order .item4 .flex-sp-row .left {
  margin-bottom: 10px;
  font-weight: 500;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .item4 .flex-sp-row .right,
.info-sign.info-sign-erc1155_transfer .item4 .flex-sp-row .right,
.info-sign.info-sign-erc20_approve .item4 .flex-sp-row .right,
.info-sign.info-sign-native_transfer .item4 .flex-sp-row .right,
.info-sign.info-sign-erc721_transfer .item4 .flex-sp-row .right,
.info-sign.info-sign-seaport_cancel_order .item4 .flex-sp-row .right,
.info-sign.info-sign-seaport_nft_listing .item4 .flex-sp-row .right,
.info-sign.info-sign-seaport_fulfill_order .item4 .flex-sp-row .right {
  color: var(--secondary-text-color);
}
.info-sign.info-sign-erc20_transfer .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-erc1155_transfer .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-erc20_approve .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-native_transfer .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-erc721_transfer .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-seaport_cancel_order .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-seaport_nft_listing .item4 .flex-sp-row .gas-warning,
.info-sign.info-sign-seaport_fulfill_order .item4 .flex-sp-row .gas-warning {
  display: flex;
  align-items: center;
  line-height: 1.3;
  color: var(--secondary-text-color);
}
.info-sign.info-sign-erc20_transfer .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-erc1155_transfer .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-erc20_approve .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-native_transfer .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-erc721_transfer .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-seaport_cancel_order .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-seaport_nft_listing .item4 .flex-sp-row .gas-warning span,
.info-sign.info-sign-seaport_fulfill_order .item4 .flex-sp-row .gas-warning span {
  line-height: 1.4;
}
.info-sign.info-sign-erc20_transfer .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-erc1155_transfer .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-erc20_approve .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-native_transfer .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-erc721_transfer .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-seaport_cancel_order .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-seaport_nft_listing .item4 .flex-sp-row .gas-warning img,
.info-sign.info-sign-seaport_fulfill_order .item4 .flex-sp-row .gas-warning img {
  flex: 1;
  align-self: flex-start;
  width: 19px;
  height: 19px;
  margin-top: 4px;
  margin-right: 10px;
}
.info-sign.info-sign-erc20_transfer .info-request,
.info-sign.info-sign-erc1155_transfer .info-request,
.info-sign.info-sign-erc20_approve .info-request,
.info-sign.info-sign-native_transfer .info-request,
.info-sign.info-sign-erc721_transfer .info-request,
.info-sign.info-sign-seaport_cancel_order .info-request,
.info-sign.info-sign-seaport_nft_listing .info-request,
.info-sign.info-sign-seaport_fulfill_order .info-request {
  display: none;
}
.info-sign.info-sign-erc20_transfer .info-title,
.info-sign.info-sign-erc1155_transfer .info-title,
.info-sign.info-sign-erc20_approve .info-title,
.info-sign.info-sign-native_transfer .info-title,
.info-sign.info-sign-erc721_transfer .info-title,
.info-sign.info-sign-seaport_cancel_order .info-title,
.info-sign.info-sign-seaport_nft_listing .info-title,
.info-sign.info-sign-seaport_fulfill_order .info-title {
  height: 20px;
  max-height: 20px;
  line-height: 20px;
  padding: 0;
  margin: 0;
}
.info-sign.info-sign-erc20_transfer .apart-line,
.info-sign.info-sign-erc1155_transfer .apart-line,
.info-sign.info-sign-erc20_approve .apart-line,
.info-sign.info-sign-native_transfer .apart-line,
.info-sign.info-sign-erc721_transfer .apart-line,
.info-sign.info-sign-seaport_cancel_order .apart-line,
.info-sign.info-sign-seaport_nft_listing .apart-line,
.info-sign.info-sign-seaport_fulfill_order .apart-line {
  display: none;
}
.info-sign.info-sign-erc20_transfer .info-address,
.info-sign.info-sign-erc1155_transfer .info-address,
.info-sign.info-sign-erc20_approve .info-address,
.info-sign.info-sign-native_transfer .info-address,
.info-sign.info-sign-erc721_transfer .info-address,
.info-sign.info-sign-seaport_cancel_order .info-address,
.info-sign.info-sign-seaport_nft_listing .info-address,
.info-sign.info-sign-seaport_fulfill_order .info-address {
  margin-top: 10px;
  margin-bottom: 10px;
}
.info-sign.info-sign-erc20_transfer .info-des,
.info-sign.info-sign-erc1155_transfer .info-des,
.info-sign.info-sign-erc20_approve .info-des,
.info-sign.info-sign-native_transfer .info-des,
.info-sign.info-sign-erc721_transfer .info-des,
.info-sign.info-sign-seaport_cancel_order .info-des,
.info-sign.info-sign-seaport_nft_listing .info-des,
.info-sign.info-sign-seaport_fulfill_order .info-des {
  display: none;
}
.info-sign.info-sign-erc20_transfer .transfer-content,
.info-sign.info-sign-erc1155_transfer .transfer-content,
.info-sign.info-sign-erc20_approve .transfer-content,
.info-sign.info-sign-native_transfer .transfer-content,
.info-sign.info-sign-erc721_transfer .transfer-content,
.info-sign.info-sign-seaport_cancel_order .transfer-content,
.info-sign.info-sign-seaport_nft_listing .transfer-content,
.info-sign.info-sign-seaport_fulfill_order .transfer-content {
  width: calc(100% - 36px);
  min-width: 230px;
  margin: auto;
  margin-top: 18px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .mg-bottom-15,
.info-sign.info-sign-erc1155_transfer .transfer-content .mg-bottom-15,
.info-sign.info-sign-erc20_approve .transfer-content .mg-bottom-15,
.info-sign.info-sign-native_transfer .transfer-content .mg-bottom-15,
.info-sign.info-sign-erc721_transfer .transfer-content .mg-bottom-15,
.info-sign.info-sign-seaport_cancel_order .transfer-content .mg-bottom-15,
.info-sign.info-sign-seaport_nft_listing .transfer-content .mg-bottom-15,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .mg-bottom-15 {
  margin-bottom: 15px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .flex-sp-row,
.info-sign.info-sign-erc1155_transfer .transfer-content .flex-sp-row,
.info-sign.info-sign-erc20_approve .transfer-content .flex-sp-row,
.info-sign.info-sign-native_transfer .transfer-content .flex-sp-row,
.info-sign.info-sign-erc721_transfer .transfer-content .flex-sp-row,
.info-sign.info-sign-seaport_cancel_order .transfer-content .flex-sp-row,
.info-sign.info-sign-seaport_nft_listing .transfer-content .flex-sp-row,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .flex-sp-row {
  display: flex;
  justify-content: space-between;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box,
.info-sign.info-sign-erc20_approve .transfer-content .less-box,
.info-sign.info-sign-native_transfer .transfer-content .less-box,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box {
  padding: 13px;
  padding-bottom: 3px;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .pn-row,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .pn-row,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .pn-row,
.info-sign.info-sign-native_transfer .transfer-content .less-box .pn-row,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .pn-row,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .pn-row,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .pn-row,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .pn-row {
  width: 100%;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item {
  padding-top: 14px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--card-divider-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item:last-child,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item:last-child {
  border-bottom: none;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row1 .left,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row1 .left {
  font-weight: 800;
  font-size: 18px;
  line-height: 19px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row1 .right,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row1 .right {
  font-weight: 500;
  font-size: 11px;
  line-height: 14px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 10px;
  font-weight: 500;
  font-size: 22px;
  line-height: 14px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .token-icon {
  width: 32px;
  min-width: 32px;
  height: 32px;
  margin-right: 6px;
  border-radius: 100%;
  overflow: hidden;
  object-fit: cover;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac1 .amount {
  line-height: 1.2;
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-all;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-weight: 500;
  font-size: 12px;
  line-height: 12px;
  color: var(--accent-color);
  cursor: pointer;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac2 .icon {
  width: 12px;
  height: 12px;
  margin-left: 6px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row-erc20-approve-content .row-ac3 {
  margin-top: 14px;
  font-weight: 500;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 {
  align-items: flex-start;
  margin-top: 20px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .left,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .left {
  display: flex;
  align-items: center;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .left .icon,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .left .icon {
  width: 32px;
  height: 32px;
  margin-right: 10px;
  border-radius: 100%;
  overflow: hidden;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .left .icon img {
  width: 100%;
  height: 100%;
  border-radius: 100%;
  object-fit: cover;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .right,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .right {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  overflow-x: auto;
  overflow-y: hidden;
  font-weight: 400;
  font-size: 14px;
  line-height: 14px;
  color: var(--secondary-text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .right .amount,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount {
  display: flex;
  flex: 1;
  justify-content: flex-start;
  align-items: center;
  height: 32px;
  line-height: 32px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .change-val {
  margin-right: 4px;
  font-weight: 500;
  font-size: 22px;
  line-height: 32px;
  white-space: nowrap;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount .symbol {
  position: relative;
  margin-left: 2px;
  font-weight: 500;
  font-size: 22px;
  line-height: 32px;
  white-space: nowrap;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row2 .right .amount-usd {
  height: 32px;
  line-height: 32px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row3,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row3 {
  justify-content: flex-start;
  align-items: center;
  margin-top: 20px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row3 .left,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row3 .left {
  width: 32px;
  height: 32px;
  margin-right: 10px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row3 .left img,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row3 .left img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row3 .right,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row3 .right {
  display: -webkit-box;
  flex: 1;
  overflow: hidden;
  font-weight: 500;
  font-size: 22px;
  line-height: 1.3;
  text-overflow: ellipsis;
  color: var(--text-color);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row3 .right .name,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row3 .right .name {
  line-height: 1.2;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row4,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row4 {
  margin-top: 10px;
  font-weight: 500;
  font-size: 14px;
  color: var(--accent-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row5,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row5 {
  margin-top: 4px;
  font-weight: 500;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item1 .row6,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item1 .row6 {
  margin-top: 4px;
  font-weight: 500;
  font-size: 14px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2-0,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2-0 {
  padding-top: 24px;
  padding-bottom: 24px;
  font-weight: 500;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 {
  padding-top: 24px;
  padding-bottom: 22px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .flex-sp-row,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .flex-sp-row {
  height: 44px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .left .pn-row1,
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .right .pn-row1,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .right .pn-row1 {
  font-weight: 400;
  font-size: 12px;
  line-height: 14px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .left .pn-row2,
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .right .pn-row2,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .right .pn-row2 {
  font-weight: 500;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .right,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .right {
  text-align: right;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .pn-row2,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .pn-row2 {
  margin-top: 10px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .middle,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .middle {
  position: relative;
  width: 34px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item2 .middle .icon,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item2 .middle .icon {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  width: 100%;
  height: 13px;
  transform: translate(-50%, -50%);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item5,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item5 {
  font-weight: 500;
  font-size: 14px;
  line-height: 30px;
  color: var(--text-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item5 .price-sub,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item5 .price-sub {
  position: relative;
  padding-left: 16px;
  font-weight: 400;
  font-size: 12px;
  line-height: 24px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-erc1155_transfer .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-erc20_approve .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-native_transfer .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-erc721_transfer .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-seaport_cancel_order .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-seaport_nft_listing .transfer-content .less-box .groups > .item.item5 .price-sub::before,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .less-box .groups > .item.item5 .price-sub::before {
  position: absolute;
  top: 50%;
  left: 4px;
  width: 5px;
  height: 5px;
  border-radius: 100%;
  background: var(--accent-color);
  transform: translateY(-50%);
  content: '';
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content,
.info-sign.info-sign-native_transfer .transfer-content .fold-content,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 30px;
  margin-top: 20px;
  margin-bottom: 5px;
  font-weight: 500;
  font-size: 13px;
  line-height: 30px;
  color: var(--accent-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content img,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content img,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content img,
.info-sign.info-sign-native_transfer .transfer-content .fold-content img,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content img,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content img,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content img,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content img {
  width: 10px;
  height: 6px;
  margin-left: 5px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-native_transfer .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content .wrap > div,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content .wrap > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-native_transfer .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content .arrow-icon,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content .arrow-icon {
  color: var(--accent-color);
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-native_transfer .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content .arrow-icon svg,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content .arrow-icon svg {
  width: 11px;
  height: 11px;
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content .fold,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content .fold,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content .fold,
.info-sign.info-sign-native_transfer .transfer-content .fold-content .fold,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content .fold,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content .fold,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content .fold,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content .fold {
  cursor: pointer;
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content .unfold,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content .unfold,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content .unfold,
.info-sign.info-sign-native_transfer .transfer-content .fold-content .unfold,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content .unfold,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content .unfold,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content .unfold,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content .unfold {
  cursor: pointer;
}
.info-sign.info-sign-erc20_transfer .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-erc1155_transfer .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-erc20_approve .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-native_transfer .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-erc721_transfer .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-seaport_cancel_order .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-seaport_nft_listing .transfer-content .fold-content .unfold .arrow-icon,
.info-sign.info-sign-seaport_fulfill_order .transfer-content .fold-content .unfold .arrow-icon {
  transform: rotate(180deg);
}
.edit-approve-amount-modal .ant-modal-content {
  overflow: hidden;
  background-color: var(--modal-background-color) !important;
}
.edit-approve-amount-modal .ant-modal-header {
  border: none;
}
.edit-approve-amount-modal .ant-modal-header .ant-modal-title {
  text-align: center;
  color: var(--text-color);
}
.edit-approve-amount-modal .ant-modal-body {
  padding-bottom: 16px;
}
.edit-approve-amount-modal .ant-form {
  display: flex;
  align-items: flex-start;
  width: 100%;
}
.edit-approve-amount-modal .ant-form .ant-row {
  flex: 1;
}
.edit-approve-amount-modal .ant-form .ant-form-item-control-input-content .ant-input {
  height: 40px;
  border: 1px solid var(--input-border-color);
  color: var(--text-color);
  background: var(--input-background-color-3);
}
.edit-approve-amount-modal .ant-form .ant-form-item-control-input-content .ant-input-status-error:not(.ant-input-disabled, .ant-input-borderless).ant-input,
.edit-approve-amount-modal .ant-form .ant-form-item-control-input-content .ant-input-status-error:not(.ant-input-disabled, .ant-input-borderless).ant-input:hover {
  background: var(--input-background-color-3);
}
.edit-approve-amount-modal .ant-form .icon {
  width: 30px;
  min-width: 30px;
  height: 30px;
  margin: 0 8px;
  margin-top: 5px;
}
.edit-approve-amount-modal .ant-form .icon img {
  width: 100%;
  height: 100%;
  border-radius: 100%;
  overflow: hidden;
  object-fit: cover;
}
.edit-approve-amount-modal .ant-form .symbol {
  font-weight: 500;
  font-size: 14px;
  line-height: 40px;
  color: var(--text-color);
}
.edit-approve-amount-modal .ant-modal-footer {
  display: flex !important;
  justify-content: center;
  padding-bottom: 30px;
  border: none;
}
.edit-approve-amount-modal .ant-modal-footer .ant-btn-default {
  display: none;
}
.edit-approve-amount-modal .ant-modal-footer .ant-btn-primary {
  width: 100%;
  max-width: 300px;
  height: 47px;
  margin-left: 0;
  border-radius: var(--primary-btn-border-radius);
  font-size: var(--primary-btn-font-size);
  line-height: 22px;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
`,zl=e=>{var n;let{userInfo:o}=e,r=Ga(),{modalOptions:t}=Ai(),s=i.useMemo(()=>{let u=`${t.appId}_${o==null?void 0:o.uuid}`;return`account_security_${Ha(u)}`},[t.appId,o==null?void 0:o.uuid]),[a,f]=i.useState({account:{name:"Account & Security",display:!0,badge:!1}});i.useEffect(()=>{if(o!=null&&o.security_account&&s&&!localStorage.getItem(s)){let{has_set_master_password:u,has_set_payment_password:d}=(o==null?void 0:o.security_account)||{};!u||!d?a.account.badge=!0:a.account.badge=!1}else a.account.badge=!1;f(xi(a))},[o==null?void 0:o.security_account,s]);let l=hn.createElement("div",{className:"item",onClick:()=>{a.account.badge=!1,f(xi(a)),r("/account/security"),localStorage.setItem(s,"true")}},hn.createElement(zi,{dot:!!a.account.badge},hn.createElement(es,{className:"wallet-icon",name:"security_icon"})));return hn.createElement("div",{className:"top-menu-list"},!!((n=a==null?void 0:a.account)!=null&&n.display)&&l)},Xl=zl,Pn={},hi;function Dl(){if(hi)return Pn;hi=1;function e(g){"@babel/helpers - typeof";return e=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(c){return typeof c}:function(c){return c&&typeof Symbol=="function"&&c.constructor===Symbol&&c!==Symbol.prototype?"symbol":typeof c},e(g)}Object.defineProperty(Pn,"__esModule",{value:!0}),Pn.CopyToClipboard=void 0;var n=t(Xa()),o=t(ts()),r=["text","onCopy","options","children"];function t(g){return g&&g.__esModule?g:{default:g}}function s(g,c){var _=Object.keys(g);if(Object.getOwnPropertySymbols){var v=Object.getOwnPropertySymbols(g);c&&(v=v.filter(function(h){return Object.getOwnPropertyDescriptor(g,h).enumerable})),_.push.apply(_,v)}return _}function a(g){for(var c=1;c<arguments.length;c++){var _=arguments[c]!=null?arguments[c]:{};c%2?s(Object(_),!0).forEach(function(v){C(g,v,_[v])}):Object.getOwnPropertyDescriptors?Object.defineProperties(g,Object.getOwnPropertyDescriptors(_)):s(Object(_)).forEach(function(v){Object.defineProperty(g,v,Object.getOwnPropertyDescriptor(_,v))})}return g}function f(g,c){if(g==null)return{};var _=l(g,c),v,h;if(Object.getOwnPropertySymbols){var I=Object.getOwnPropertySymbols(g);for(h=0;h<I.length;h++)v=I[h],!(c.indexOf(v)>=0)&&Object.prototype.propertyIsEnumerable.call(g,v)&&(_[v]=g[v])}return _}function l(g,c){if(g==null)return{};var _={},v=Object.keys(g),h,I;for(I=0;I<v.length;I++)h=v[I],!(c.indexOf(h)>=0)&&(_[h]=g[h]);return _}function u(g,c){if(!(g instanceof c))throw new TypeError("Cannot call a class as a function")}function d(g,c){for(var _=0;_<c.length;_++){var v=c[_];v.enumerable=v.enumerable||!1,v.configurable=!0,"value"in v&&(v.writable=!0),Object.defineProperty(g,v.key,v)}}function p(g,c,_){return c&&d(g.prototype,c),Object.defineProperty(g,"prototype",{writable:!1}),g}function b(g,c){if(typeof c!="function"&&c!==null)throw new TypeError("Super expression must either be null or a function");g.prototype=Object.create(c&&c.prototype,{constructor:{value:g,writable:!0,configurable:!0}}),Object.defineProperty(g,"prototype",{writable:!1}),c&&w(g,c)}function w(g,c){return w=Object.setPrototypeOf||function(v,h){return v.__proto__=h,v},w(g,c)}function x(g){var c=R();return function(){var v=y(g),h;if(c){var I=y(this).constructor;h=Reflect.construct(v,arguments,I)}else h=v.apply(this,arguments);return S(this,h)}}function S(g,c){if(c&&(e(c)==="object"||typeof c=="function"))return c;if(c!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return E(g)}function E(g){if(g===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return g}function R(){if(typeof Reflect>"u"||!Reflect.construct||Reflect.construct.sham)return!1;if(typeof Proxy=="function")return!0;try{return Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){})),!0}catch{return!1}}function y(g){return y=Object.setPrototypeOf?Object.getPrototypeOf:function(_){return _.__proto__||Object.getPrototypeOf(_)},y(g)}function C(g,c,_){return c in g?Object.defineProperty(g,c,{value:_,enumerable:!0,configurable:!0,writable:!0}):g[c]=_,g}var P=function(g){b(_,g);var c=x(_);function _(){var v;u(this,_);for(var h=arguments.length,I=new Array(h),m=0;m<h;m++)I[m]=arguments[m];return v=c.call.apply(c,[this].concat(I)),C(E(v),"onClick",function(T){var k=v.props,O=k.text,D=k.onCopy,U=k.children,$=k.options,W=n.default.Children.only(U),X=(0,o.default)(O,$);D&&D(O,X),W&&W.props&&typeof W.props.onClick=="function"&&W.props.onClick(T)}),v}return p(_,[{key:"render",value:function(){var h=this.props;h.text,h.onCopy,h.options;var I=h.children,m=f(h,r),T=n.default.Children.only(I);return n.default.cloneElement(T,a(a({},m),{},{onClick:this.onClick}))}}]),_}(n.default.PureComponent);return Pn.CopyToClipboard=P,C(P,"defaultProps",{onCopy:void 0,options:void 0}),Pn}var dr,_i;function $l(){if(_i)return dr;_i=1;var e=Dl(),n=e.CopyToClipboard;return n.CopyToClipboard=n,dr=n,dr}var Bl=$l();const Zl=Ni(Bl);export{Gl as D,Zl as I,Yl as L,Vf as T,Hl as V,Xl as n};
