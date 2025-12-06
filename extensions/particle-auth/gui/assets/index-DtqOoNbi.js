import{d0 as Ke,fJ as Ya,r as i,cW as Re,bK as ie,cX as Q,cS as te,dk as on,cP as k,cZ as Hi,c8 as Ui,a4 as Pe,dj as Za,c_ as qr,c$ as Gi,d1 as st,dq as V,d3 as lt,e4 as Xi,dJ as Kr,cU as Ne,dm as Yi,dD as Zi,dC as Ji,cT as Z,fK as Ja,e8 as Qi,cY as sn,dM as Qa,di as ea,dE as na,ei as Br,dA as es,dB as ns,dh as ts,dg as rs,dG as ta,cQ as ct,bJ as ra,dl as os,e3 as is,ec as as,eR as oa,fL as Nr,d4 as ss,d9 as ls,du as cs,fM as Fr,fN as ia,fO as fs,fP as Fn,fQ as us,fR as Wr,fS as Wn,fT as mn,fU as gs,fV as Vr,fW as ds,bH as Hr,fX as ps,fY as ms,bI as aa,fZ as vs,Y as sa,a7 as bs,f_ as hs,f$ as xs,aw as _s,g0 as ys,b2 as ws,aZ as Ss,g1 as fo,g2 as Cs}from"./index-DvWLDOVr.js";import{R as Kn,g as la,a as ca,T as fa,u as In,i as $s}from"./colors-D7Fyz_4e.js";import{d as Rs,H as Is,s as Es}from"./chunk-YNAB6HVU-BmN5cA8h.js";import{r as Ps}from"./index-BqT3UfUb.js";const Os=new Ke("antSlideUpIn",{"0%":{transform:"scaleY(0.8)",transformOrigin:"0% 0%",opacity:0},"100%":{transform:"scaleY(1)",transformOrigin:"0% 0%",opacity:1}}),Ts=new Ke("antSlideUpOut",{"0%":{transform:"scaleY(1)",transformOrigin:"0% 0%",opacity:1},"100%":{transform:"scaleY(0.8)",transformOrigin:"0% 0%",opacity:0}}),Ms=new Ke("antSlideDownIn",{"0%":{transform:"scaleY(0.8)",transformOrigin:"100% 100%",opacity:0},"100%":{transform:"scaleY(1)",transformOrigin:"100% 100%",opacity:1}}),Ns=new Ke("antSlideDownOut",{"0%":{transform:"scaleY(1)",transformOrigin:"100% 100%",opacity:1},"100%":{transform:"scaleY(0.8)",transformOrigin:"100% 100%",opacity:0}}),As=new Ke("antSlideLeftIn",{"0%":{transform:"scaleX(0.8)",transformOrigin:"0% 0%",opacity:0},"100%":{transform:"scaleX(1)",transformOrigin:"0% 0%",opacity:1}}),ks=new Ke("antSlideLeftOut",{"0%":{transform:"scaleX(1)",transformOrigin:"0% 0%",opacity:1},"100%":{transform:"scaleX(0.8)",transformOrigin:"0% 0%",opacity:0}}),js=new Ke("antSlideRightIn",{"0%":{transform:"scaleX(0.8)",transformOrigin:"100% 0%",opacity:0},"100%":{transform:"scaleX(1)",transformOrigin:"100% 0%",opacity:1}}),zs=new Ke("antSlideRightOut",{"0%":{transform:"scaleX(1)",transformOrigin:"100% 0%",opacity:1},"100%":{transform:"scaleX(0.8)",transformOrigin:"100% 0%",opacity:0}}),Ls={"slide-up":{inKeyframes:Os,outKeyframes:Ts},"slide-down":{inKeyframes:Ms,outKeyframes:Ns},"slide-left":{inKeyframes:As,outKeyframes:ks},"slide-right":{inKeyframes:js,outKeyframes:zs}},uo=(e,n)=>{const{antCls:r}=e,t=`${r}-${n}`,{inKeyframes:o,outKeyframes:a}=Ls[n];return[Ya(t,o,a,e.motionDurationMid),{[`
      ${t}-enter,
      ${t}-appear
    `]:{transform:"scale(0)",transformOrigin:"0% 0%",opacity:0,animationTimingFunction:e.motionEaseOutQuint,"&-prepare":{transform:"scale(1)"}},[`${t}-leave`]:{animationTimingFunction:e.motionEaseInQuint}}]};var Ds=["prefixCls","invalidate","item","renderItem","responsive","responsiveDisabled","registerSize","itemKey","className","style","children","display","order","component"],yn=void 0;function qs(e,n){var r=e.prefixCls,t=e.invalidate,o=e.item,a=e.renderItem,s=e.responsive,l=e.responsiveDisabled,f=e.registerSize,c=e.itemKey,d=e.className,u=e.style,v=e.children,w=e.display,x=e.order,I=e.component,S=I===void 0?"div":I,$=Re(e,Ds),m=s&&!w;function R(b){f(c,b)}i.useEffect(function(){return function(){R(null)}},[]);var P=a&&o!==yn?a(o,{index:x}):v,p;t||(p={opacity:m?0:1,height:m?0:yn,overflowY:m?"hidden":yn,order:s?x:yn,pointerEvents:m?"none":yn,position:m?"absolute":yn});var g={};m&&(g["aria-hidden"]=!0);var C=i.createElement(S,ie({className:te(!t&&r,d),style:Q(Q({},p),u)},g,$,{ref:n}),P);return s&&(C=i.createElement(Kn,{onResize:function(y){var O=y.offsetWidth;R(O)},disabled:l},C)),C}var Rn=i.forwardRef(qs);Rn.displayName="Item";function Ks(e){if(typeof MessageChannel>"u")on(e);else{var n=new MessageChannel;n.port1.onmessage=function(){return e()},n.port2.postMessage(void 0)}}function Bs(){var e=i.useRef(null),n=function(t){e.current||(e.current=[],Ks(function(){Ui.unstable_batchedUpdates(function(){e.current.forEach(function(o){o()}),e.current=null})})),e.current.push(t)};return n}function wn(e,n){var r=i.useState(n),t=k(r,2),o=t[0],a=t[1],s=Hi(function(l){e(function(){a(l)})});return[o,s]}var it=Pe.createContext(null),Fs=["component"],Ws=["className"],Vs=["className"],Hs=function(n,r){var t=i.useContext(it);if(!t){var o=n.component,a=o===void 0?"div":o,s=Re(n,Fs);return i.createElement(a,ie({},s,{ref:r}))}var l=t.className,f=Re(t,Ws),c=n.className,d=Re(n,Vs);return i.createElement(it.Provider,{value:null},i.createElement(Rn,ie({ref:r,className:te(l,c)},f,d)))},ua=i.forwardRef(Hs);ua.displayName="RawItem";var Us=["prefixCls","data","renderItem","renderRawItem","itemKey","itemWidth","ssr","style","className","maxCount","renderRest","renderRawRest","prefix","suffix","component","itemComponent","onVisibleChange"],ga="responsive",da="invalidate";function Gs(e){return"+ ".concat(e.length," ...")}function Xs(e,n){var r=e.prefixCls,t=r===void 0?"rc-overflow":r,o=e.data,a=o===void 0?[]:o,s=e.renderItem,l=e.renderRawItem,f=e.itemKey,c=e.itemWidth,d=c===void 0?10:c,u=e.ssr,v=e.style,w=e.className,x=e.maxCount,I=e.renderRest,S=e.renderRawRest,$=e.prefix,m=e.suffix,R=e.component,P=R===void 0?"div":R,p=e.itemComponent,g=e.onVisibleChange,C=Re(e,Us),b=u==="full",y=Bs(),O=wn(y,null),h=k(O,2),_=h[0],E=h[1],T=_||0,B=wn(y,new Map),H=k(B,2),q=H[0],D=H[1],re=wn(y,0),M=k(re,2),se=M[0],le=M[1],N=wn(y,0),j=k(N,2),F=j[0],Y=j[1],ee=wn(y,0),G=k(ee,2),W=G[0],fe=G[1],de=wn(y,0),Oe=k(de,2),Ie=Oe[0],X=Oe[1],z=i.useState(null),xe=k(z,2),L=xe[0],_e=xe[1],ue=i.useState(null),Ae=k(ue,2),$e=Ae[0],he=Ae[1],U=i.useMemo(function(){return $e===null&&b?Number.MAX_SAFE_INTEGER:$e||0},[$e,_]),qe=i.useState(!1),Te=k(qe,2),Me=Te[0],Ye=Te[1],me="".concat(t,"-item"),ye=Math.max(se,F),ze=x===ga,ve=a.length&&ze,Be=x===da,Ee=ve||typeof x=="number"&&a.length>x,ae=i.useMemo(function(){var K=a;return ve?_===null&&b?K=a:K=a.slice(0,Math.min(a.length,T/d)):typeof x=="number"&&(K=a.slice(0,x)),K},[a,d,_,x,ve]),ke=i.useMemo(function(){return ve?a.slice(U+1):a.slice(ae.length)},[a,ae,ve,U]),we=i.useCallback(function(K,oe){var Se;return typeof f=="function"?f(K):(Se=f&&(K==null?void 0:K[f]))!==null&&Se!==void 0?Se:oe},[f]),fn=i.useCallback(s||function(K){return K},[s]);function tn(K,oe,Se){$e===K&&(oe===void 0||oe===L)||(he(K),Se||(Ye(K<a.length-1),g==null||g(K)),oe!==void 0&&_e(oe))}function vn(K,oe){E(oe.clientWidth)}function bn(K,oe){D(function(Se){var je=new Map(Se);return oe===null?je.delete(K):je.set(K,oe),je})}function un(K,oe){Y(oe),le(F)}function hn(K,oe){fe(oe)}function xn(K,oe){X(oe)}function Ze(K){return q.get(we(ae[K],K))}Za(function(){if(T&&typeof ye=="number"&&ae){var K=W+Ie,oe=ae.length,Se=oe-1;if(!oe){tn(0,null);return}for(var je=0;je<oe;je+=1){var He=Ze(je);if(b&&(He=He||0),He===void 0){tn(je-1,void 0,!0);break}if(K+=He,Se===0&&K<=T||je===Se-1&&K+Ze(Se)<=T){tn(Se,null);break}else if(K+ye>T){tn(je-1,K-He-Ie+F);break}}m&&Ze(0)+Ie>T&&_e(null)}},[T,q,F,W,Ie,we,ae]);var Fe=Me&&!!ke.length,Je={};L!==null&&ve&&(Je={position:"absolute",left:L,top:0});var nn={prefixCls:me,responsive:ve,component:p,invalidate:Be},gn=l?function(K,oe){var Se=we(K,oe);return i.createElement(it.Provider,{key:Se,value:Q(Q({},nn),{},{order:oe,item:K,itemKey:Se,registerSize:bn,display:oe<=U})},l(K,oe))}:function(K,oe){var Se=we(K,oe);return i.createElement(Rn,ie({},nn,{order:oe,key:Se,item:K,renderItem:fn,itemKey:Se,registerSize:bn,display:oe<=U}))},We={order:Fe?U:Number.MAX_SAFE_INTEGER,className:"".concat(me,"-rest"),registerSize:un,display:Fe},ln=I||Gs,Ve=S?i.createElement(it.Provider,{value:Q(Q({},nn),We)},S(ke)):i.createElement(Rn,ie({},nn,We),typeof ln=="function"?ln(ke):ln),Xe=i.createElement(P,ie({className:te(!Be&&t,w),style:v,ref:n},C),$&&i.createElement(Rn,ie({},nn,{responsive:ze,responsiveDisabled:!ve,order:-1,className:"".concat(me,"-prefix"),registerSize:hn,display:!0}),$),ae.map(gn),Ee?Ve:null,m&&i.createElement(Rn,ie({},nn,{responsive:ze,responsiveDisabled:!ve,order:U,className:"".concat(me,"-suffix"),registerSize:xn,display:!0,style:Je}),m));return ze?i.createElement(Kn,{onResize:vn,disabled:!ve},Xe):Xe}var an=i.forwardRef(Xs);an.displayName="Overflow";an.Item=ua;an.RESPONSIVE=ga;an.INVALIDATE=da;const Ys=new Ke("antStatusProcessing",{"0%":{transform:"scale(0.8)",opacity:.5},"100%":{transform:"scale(2.4)",opacity:0}}),Zs=new Ke("antZoomBadgeIn",{"0%":{transform:"scale(0) translate(50%, -50%)",opacity:0},"100%":{transform:"scale(1) translate(50%, -50%)"}}),Js=new Ke("antZoomBadgeOut",{"0%":{transform:"scale(1) translate(50%, -50%)"},"100%":{transform:"scale(0) translate(50%, -50%)",opacity:0}}),Qs=new Ke("antNoWrapperZoomBadgeIn",{"0%":{transform:"scale(0)",opacity:0},"100%":{transform:"scale(1)"}}),el=new Ke("antNoWrapperZoomBadgeOut",{"0%":{transform:"scale(1)"},"100%":{transform:"scale(0)",opacity:0}}),nl=new Ke("antBadgeLoadingCircle",{"0%":{transformOrigin:"50%"},"100%":{transform:"translate(50%, -50%) rotate(360deg)",transformOrigin:"50%"}}),tl=e=>{const{componentCls:n,iconCls:r,antCls:t,badgeShadowSize:o,textFontSize:a,textFontSizeSM:s,statusSize:l,dotSize:f,textFontWeight:c,indicatorHeight:d,indicatorHeightSM:u,marginXS:v,calc:w}=e,x=`${t}-scroll-number`,I=la(e,(S,{darkColor:$})=>({[`&${n} ${n}-color-${S}`]:{background:$,[`&:not(${n}-count)`]:{color:$},"a:hover &":{background:$}}}));return{[n]:Object.assign(Object.assign(Object.assign(Object.assign({},st(e)),{position:"relative",display:"inline-block",width:"fit-content",lineHeight:1,[`${n}-count`]:{display:"inline-flex",justifyContent:"center",zIndex:e.indicatorZIndex,minWidth:d,height:d,color:e.badgeTextColor,fontWeight:c,fontSize:a,lineHeight:V(d),whiteSpace:"nowrap",textAlign:"center",background:e.badgeColor,borderRadius:w(d).div(2).equal(),boxShadow:`0 0 0 ${V(o)} ${e.badgeShadowColor}`,transition:`background ${e.motionDurationMid}`,a:{color:e.badgeTextColor},"a:hover":{color:e.badgeTextColor},"a:hover &":{background:e.badgeColorHover}},[`${n}-count-sm`]:{minWidth:u,height:u,fontSize:s,lineHeight:V(u),borderRadius:w(u).div(2).equal()},[`${n}-multiple-words`]:{padding:`0 ${V(e.paddingXS)}`,bdi:{unicodeBidi:"plaintext"}},[`${n}-dot`]:{zIndex:e.indicatorZIndex,width:f,minWidth:f,height:f,background:e.badgeColor,borderRadius:"100%",boxShadow:`0 0 0 ${V(o)} ${e.badgeShadowColor}`},[`${n}-count, ${n}-dot, ${x}-custom-component`]:{position:"absolute",top:0,insetInlineEnd:0,transform:"translate(50%, -50%)",transformOrigin:"100% 0%",[`&${r}-spin`]:{animationName:nl,animationDuration:"1s",animationIterationCount:"infinite",animationTimingFunction:"linear"}},[`&${n}-status`]:{lineHeight:"inherit",verticalAlign:"baseline",[`${n}-status-dot`]:{position:"relative",top:-1,display:"inline-block",width:l,height:l,verticalAlign:"middle",borderRadius:"50%"},[`${n}-status-success`]:{backgroundColor:e.colorSuccess},[`${n}-status-processing`]:{overflow:"visible",color:e.colorInfo,backgroundColor:e.colorInfo,borderColor:"currentcolor","&::after":{position:"absolute",top:0,insetInlineStart:0,width:"100%",height:"100%",borderWidth:o,borderStyle:"solid",borderColor:"inherit",borderRadius:"50%",animationName:Ys,animationDuration:e.badgeProcessingDuration,animationIterationCount:"infinite",animationTimingFunction:"ease-in-out",content:'""'}},[`${n}-status-default`]:{backgroundColor:e.colorTextPlaceholder},[`${n}-status-error`]:{backgroundColor:e.colorError},[`${n}-status-warning`]:{backgroundColor:e.colorWarning},[`${n}-status-text`]:{marginInlineStart:v,color:e.colorText,fontSize:e.fontSize}}}),I),{[`${n}-zoom-appear, ${n}-zoom-enter`]:{animationName:Zs,animationDuration:e.motionDurationSlow,animationTimingFunction:e.motionEaseOutBack,animationFillMode:"both"},[`${n}-zoom-leave`]:{animationName:Js,animationDuration:e.motionDurationSlow,animationTimingFunction:e.motionEaseOutBack,animationFillMode:"both"},[`&${n}-not-a-wrapper`]:{[`${n}-zoom-appear, ${n}-zoom-enter`]:{animationName:Qs,animationDuration:e.motionDurationSlow,animationTimingFunction:e.motionEaseOutBack},[`${n}-zoom-leave`]:{animationName:el,animationDuration:e.motionDurationSlow,animationTimingFunction:e.motionEaseOutBack},[`&:not(${n}-status)`]:{verticalAlign:"middle"},[`${x}-custom-component, ${n}-count`]:{transform:"none"},[`${x}-custom-component, ${x}`]:{position:"relative",top:"auto",display:"block",transformOrigin:"50% 50%"}},[x]:{overflow:"hidden",transition:`all ${e.motionDurationMid} ${e.motionEaseOutBack}`,[`${x}-only`]:{position:"relative",display:"inline-block",height:d,transition:`all ${e.motionDurationSlow} ${e.motionEaseOutBack}`,WebkitTransformStyle:"preserve-3d",WebkitBackfaceVisibility:"hidden",[`> p${x}-only-unit`]:{height:d,margin:0,WebkitTransformStyle:"preserve-3d",WebkitBackfaceVisibility:"hidden"}},[`${x}-symbol`]:{verticalAlign:"top"}},"&-rtl":{direction:"rtl",[`${n}-count, ${n}-dot, ${x}-custom-component`]:{transform:"translate(-50%, -50%)"}}})}},pa=e=>{const{fontHeight:n,lineWidth:r,marginXS:t,colorBorderBg:o}=e,a=n,s=r,l=e.colorTextLightSolid,f=e.colorError,c=e.colorErrorHover;return Gi(e,{badgeFontHeight:a,badgeShadowSize:s,badgeTextColor:l,badgeColor:f,badgeColorHover:c,badgeShadowColor:o,badgeProcessingDuration:"1.2s",badgeRibbonOffset:t,badgeRibbonCornerTransform:"scaleY(0.75)",badgeRibbonCornerFilter:"brightness(75%)"})},ma=e=>{const{fontSize:n,lineHeight:r,fontSizeSM:t,lineWidth:o}=e;return{indicatorZIndex:"auto",indicatorHeight:Math.round(n*r)-2*o,indicatorHeightSM:n,dotSize:t/2,textFontSize:t,textFontSizeSM:t,textFontWeight:"normal",statusSize:t/2}},rl=qr("Badge",e=>{const n=pa(e);return tl(n)},ma),ol=e=>{const{antCls:n,badgeFontHeight:r,marginXS:t,badgeRibbonOffset:o,calc:a}=e,s=`${n}-ribbon`,l=`${n}-ribbon-wrapper`,f=la(e,(c,{darkColor:d})=>({[`&${s}-color-${c}`]:{background:d,color:d}}));return{[l]:{position:"relative"},[s]:Object.assign(Object.assign(Object.assign(Object.assign({},st(e)),{position:"absolute",top:t,padding:`0 ${V(e.paddingXS)}`,color:e.colorPrimary,lineHeight:V(r),whiteSpace:"nowrap",backgroundColor:e.colorPrimary,borderRadius:e.borderRadiusSM,[`${s}-text`]:{color:e.badgeTextColor},[`${s}-corner`]:{position:"absolute",top:"100%",width:o,height:o,color:"currentcolor",border:`${V(a(o).div(2).equal())} solid`,transform:e.badgeRibbonCornerTransform,transformOrigin:"top",filter:e.badgeRibbonCornerFilter}}),f),{[`&${s}-placement-end`]:{insetInlineEnd:a(o).mul(-1).equal(),borderEndEndRadius:0,[`${s}-corner`]:{insetInlineEnd:0,borderInlineEndColor:"transparent",borderBlockEndColor:"transparent"}},[`&${s}-placement-start`]:{insetInlineStart:a(o).mul(-1).equal(),borderEndStartRadius:0,[`${s}-corner`]:{insetInlineStart:0,borderBlockEndColor:"transparent",borderInlineStartColor:"transparent"}},"&-rtl":{direction:"rtl"}})}},il=qr(["Badge","Ribbon"],e=>{const n=pa(e);return ol(n)},ma),al=e=>{const{className:n,prefixCls:r,style:t,color:o,children:a,text:s,placement:l="end",rootClassName:f}=e,{getPrefixCls:c,direction:d}=i.useContext(lt),u=c("ribbon",r),v=`${u}-wrapper`,[w,x,I]=il(u,v),S=ca(o,!1),$=te(u,`${u}-placement-${l}`,{[`${u}-rtl`]:d==="rtl",[`${u}-color-${o}`]:S},n),m={},R={};return o&&!S&&(m.background=o,R.color=o),w(i.createElement("div",{className:te(v,f,x,I)},a,i.createElement("div",{className:te($,x),style:Object.assign(Object.assign({},m),t)},i.createElement("span",{className:`${u}-text`},s),i.createElement("div",{className:`${u}-corner`,style:R}))))},go=e=>{const{prefixCls:n,value:r,current:t,offset:o=0}=e;let a;return o&&(a={position:"absolute",top:`${o}00%`,left:0}),i.createElement("span",{style:a,className:te(`${n}-only-unit`,{current:t})},r)};function sl(e,n,r){let t=e,o=0;for(;(t+10)%10!==n;)t+=r,o+=r;return o}const ll=e=>{const{prefixCls:n,count:r,value:t}=e,o=Number(t),a=Math.abs(r),[s,l]=i.useState(o),[f,c]=i.useState(a),d=()=>{l(o),c(a)};i.useEffect(()=>{const w=setTimeout(d,1e3);return()=>clearTimeout(w)},[o]);let u,v;if(s===o||Number.isNaN(o)||Number.isNaN(s))u=[i.createElement(go,Object.assign({},e,{key:o,current:!0}))],v={transition:"none"};else{u=[];const w=o+10,x=[];for(let m=o;m<=w;m+=1)x.push(m);const I=f<a?1:-1,S=x.findIndex(m=>m%10===s);u=(I<0?x.slice(0,S+1):x.slice(S)).map((m,R)=>{const P=m%10;return i.createElement(go,Object.assign({},e,{key:m,value:P,offset:I<0?R-S:R,current:R===S}))}),v={transform:`translateY(${-sl(s,o,I)}00%)`}}return i.createElement("span",{className:`${n}-only`,style:v,onTransitionEnd:d},u)};var cl=function(e,n){var r={};for(var t in e)Object.prototype.hasOwnProperty.call(e,t)&&n.indexOf(t)<0&&(r[t]=e[t]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var o=0,t=Object.getOwnPropertySymbols(e);o<t.length;o++)n.indexOf(t[o])<0&&Object.prototype.propertyIsEnumerable.call(e,t[o])&&(r[t[o]]=e[t[o]]);return r};const fl=i.forwardRef((e,n)=>{const{prefixCls:r,count:t,className:o,motionClassName:a,style:s,title:l,show:f,component:c="sup",children:d}=e,u=cl(e,["prefixCls","count","className","motionClassName","style","title","show","component","children"]),{getPrefixCls:v}=i.useContext(lt),w=v("scroll-number",r),x=Object.assign(Object.assign({},u),{"data-show":f,style:s,className:te(w,o,a),title:l});let I=t;if(t&&Number(t)%1===0){const S=String(t).split("");I=i.createElement("bdi",null,S.map(($,m)=>i.createElement(ll,{prefixCls:w,count:Number(t),value:$,key:S.length-m})))}return s!=null&&s.borderColor&&(x.style=Object.assign(Object.assign({},s),{boxShadow:`0 0 0 1px ${s.borderColor} inset`})),d?Xi(d,S=>({className:te(`${w}-custom-component`,S==null?void 0:S.className,a)})):i.createElement(c,Object.assign({},x,{ref:n}),I)});var ul=function(e,n){var r={};for(var t in e)Object.prototype.hasOwnProperty.call(e,t)&&n.indexOf(t)<0&&(r[t]=e[t]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var o=0,t=Object.getOwnPropertySymbols(e);o<t.length;o++)n.indexOf(t[o])<0&&Object.prototype.propertyIsEnumerable.call(e,t[o])&&(r[t[o]]=e[t[o]]);return r};const gl=i.forwardRef((e,n)=>{var r,t,o,a,s;const{prefixCls:l,scrollNumberPrefixCls:f,children:c,status:d,text:u,color:v,count:w=null,overflowCount:x=99,dot:I=!1,size:S="default",title:$,offset:m,style:R,className:P,rootClassName:p,classNames:g,styles:C,showZero:b=!1}=e,y=ul(e,["prefixCls","scrollNumberPrefixCls","children","status","text","color","count","overflowCount","dot","size","title","offset","style","className","rootClassName","classNames","styles","showZero"]),{getPrefixCls:O,direction:h,badge:_}=i.useContext(lt),E=O("badge",l),[T,B,H]=rl(E),q=w>x?`${x}+`:w,D=q==="0"||q===0||u==="0"||u===0,re=w===null||D&&!b,M=(d!=null||v!=null)&&re,se=d!=null||!D,le=I&&!D,N=le?"":q,j=i.useMemo(()=>((N==null||N==="")&&(u==null||u==="")||D&&!b)&&!le,[N,D,b,le,u]),F=i.useRef(w);j||(F.current=w);const Y=F.current,ee=i.useRef(N);j||(ee.current=N);const G=ee.current,W=i.useRef(le);j||(W.current=le);const fe=i.useMemo(()=>{if(!m)return Object.assign(Object.assign({},_==null?void 0:_.style),R);const ue={marginTop:m[1]};return h==="rtl"?ue.left=Number.parseInt(m[0],10):ue.right=-Number.parseInt(m[0],10),Object.assign(Object.assign(Object.assign({},ue),_==null?void 0:_.style),R)},[h,m,R,_==null?void 0:_.style]),de=$??(typeof Y=="string"||typeof Y=="number"?Y:void 0),Oe=!j&&(u===0?b:!!u&&u!==!0),Ie=Oe?i.createElement("span",{className:`${E}-status-text`},u):null,X=!Y||typeof Y!="object"?void 0:Xi(Y,ue=>({style:Object.assign(Object.assign({},fe),ue.style)})),z=ca(v,!1),xe=te(g==null?void 0:g.indicator,(r=_==null?void 0:_.classNames)===null||r===void 0?void 0:r.indicator,{[`${E}-status-dot`]:M,[`${E}-status-${d}`]:!!d,[`${E}-color-${v}`]:z}),L={};v&&!z&&(L.color=v,L.background=v);const _e=te(E,{[`${E}-status`]:M,[`${E}-not-a-wrapper`]:!c,[`${E}-rtl`]:h==="rtl"},P,p,_==null?void 0:_.className,(t=_==null?void 0:_.classNames)===null||t===void 0?void 0:t.root,g==null?void 0:g.root,B,H);if(!c&&M&&(u||se||!re)){const ue=fe.color;return T(i.createElement("span",Object.assign({},y,{className:_e,style:Object.assign(Object.assign(Object.assign({},C==null?void 0:C.root),(o=_==null?void 0:_.styles)===null||o===void 0?void 0:o.root),fe)}),i.createElement("span",{className:xe,style:Object.assign(Object.assign(Object.assign({},C==null?void 0:C.indicator),(a=_==null?void 0:_.styles)===null||a===void 0?void 0:a.indicator),L)}),Oe&&i.createElement("span",{style:{color:ue},className:`${E}-status-text`},u)))}return T(i.createElement("span",Object.assign({ref:n},y,{className:_e,style:Object.assign(Object.assign({},(s=_==null?void 0:_.styles)===null||s===void 0?void 0:s.root),C==null?void 0:C.root)}),c,i.createElement(Kr,{visible:!j,motionName:`${E}-zoom`,motionAppear:!1,motionDeadline:1e3},({className:ue})=>{var Ae,$e;const he=O("scroll-number",f),U=W.current,qe=te(g==null?void 0:g.indicator,(Ae=_==null?void 0:_.classNames)===null||Ae===void 0?void 0:Ae.indicator,{[`${E}-dot`]:U,[`${E}-count`]:!U,[`${E}-count-sm`]:S==="small",[`${E}-multiple-words`]:!U&&G&&G.toString().length>1,[`${E}-status-${d}`]:!!d,[`${E}-color-${v}`]:z});let Te=Object.assign(Object.assign(Object.assign({},C==null?void 0:C.indicator),($e=_==null?void 0:_.styles)===null||$e===void 0?void 0:$e.indicator),fe);return v&&!z&&(Te=Te||{},Te.background=v),i.createElement(fl,{prefixCls:he,show:!j,motionClassName:ue,className:qe,count:G,title:de,style:Te,key:"scrollNumber"},X)}),Ie))}),va=gl;va.Ribbon=al;var dl=Ne.ESC,pl=Ne.TAB;function ml(e){var n=e.visible,r=e.triggerRef,t=e.onVisibleChange,o=e.autoFocus,a=e.overlayRef,s=i.useRef(!1),l=function(){if(n){var u,v;(u=r.current)===null||u===void 0||(v=u.focus)===null||v===void 0||v.call(u),t==null||t(!1)}},f=function(){var u;return(u=a.current)!==null&&u!==void 0&&u.focus?(a.current.focus(),s.current=!0,!0):!1},c=function(u){switch(u.keyCode){case dl:l();break;case pl:{var v=!1;s.current||(v=f()),v?u.preventDefault():l();break}}};i.useEffect(function(){return n?(window.addEventListener("keydown",c),o&&on(f,3),function(){window.removeEventListener("keydown",c),s.current=!1}):function(){s.current=!1}},[n])}var vl=i.forwardRef(function(e,n){var r=e.overlay,t=e.arrow,o=e.prefixCls,a=i.useMemo(function(){var l;return typeof r=="function"?l=r():l=r,l},[r]),s=Yi(n,Zi(a));return Pe.createElement(Pe.Fragment,null,t&&Pe.createElement("div",{className:"".concat(o,"-arrow")}),Pe.cloneElement(a,{ref:Ji(a)?s:void 0}))}),Sn={adjustX:1,adjustY:1},Cn=[0,0],bl={topLeft:{points:["bl","tl"],overflow:Sn,offset:[0,-4],targetOffset:Cn},top:{points:["bc","tc"],overflow:Sn,offset:[0,-4],targetOffset:Cn},topRight:{points:["br","tr"],overflow:Sn,offset:[0,-4],targetOffset:Cn},bottomLeft:{points:["tl","bl"],overflow:Sn,offset:[0,4],targetOffset:Cn},bottom:{points:["tc","bc"],overflow:Sn,offset:[0,4],targetOffset:Cn},bottomRight:{points:["tr","br"],overflow:Sn,offset:[0,4],targetOffset:Cn}},hl=["arrow","prefixCls","transitionName","animation","align","placement","placements","getPopupContainer","showAction","hideAction","overlayClassName","overlayStyle","visible","trigger","autoFocus","overlay","children","onVisibleChange"];function xl(e,n){var r,t=e.arrow,o=t===void 0?!1:t,a=e.prefixCls,s=a===void 0?"rc-dropdown":a,l=e.transitionName,f=e.animation,c=e.align,d=e.placement,u=d===void 0?"bottomLeft":d,v=e.placements,w=v===void 0?bl:v,x=e.getPopupContainer,I=e.showAction,S=e.hideAction,$=e.overlayClassName,m=e.overlayStyle,R=e.visible,P=e.trigger,p=P===void 0?["hover"]:P,g=e.autoFocus,C=e.overlay,b=e.children,y=e.onVisibleChange,O=Re(e,hl),h=Pe.useState(),_=k(h,2),E=_[0],T=_[1],B="visible"in e?R:E,H=Pe.useRef(null),q=Pe.useRef(null),D=Pe.useRef(null);Pe.useImperativeHandle(n,function(){return H.current});var re=function(G){T(G),y==null||y(G)};ml({visible:B,triggerRef:D,onVisibleChange:re,autoFocus:g,overlayRef:q});var M=function(G){var W=e.onOverlayClick;T(!1),W&&W(G)},se=function(){return Pe.createElement(vl,{ref:q,overlay:C,prefixCls:s,arrow:o})},le=function(){return typeof C=="function"?se:se()},N=function(){var G=e.minOverlayWidthMatchTrigger,W=e.alignPoint;return"minOverlayWidthMatchTrigger"in e?G:!W},j=function(){var G=e.openClassName;return G!==void 0?G:"".concat(s,"-open")},F=Pe.cloneElement(b,{className:te((r=b.props)===null||r===void 0?void 0:r.className,B&&j()),ref:Ji(b)?Yi(D,Zi(b)):void 0}),Y=S;return!Y&&p.indexOf("contextMenu")!==-1&&(Y=["click"]),Pe.createElement(fa,ie({builtinPlacements:w},O,{prefixCls:s,ref:H,popupClassName:te($,Z({},"".concat(s,"-show-arrow"),o)),popupStyle:m,action:p,showAction:I,hideAction:Y,popupPlacement:u,popupAlign:c,popupTransitionName:l,popupAnimation:f,popupVisible:B,stretch:N()?"minWidth":"",popup:le(),onPopupVisibleChange:re,onPopupClick:M,getPopupContainer:x}),F)}const _l=Pe.forwardRef(xl);var ba=i.createContext(null);function ha(e,n){return e===void 0?null:"".concat(e,"-").concat(n)}function xa(e){var n=i.useContext(ba);return ha(n,e)}var yl=["children","locked"],en=i.createContext(null);function wl(e,n){var r=Q({},e);return Object.keys(n).forEach(function(t){var o=n[t];o!==void 0&&(r[t]=o)}),r}function Bn(e){var n=e.children,r=e.locked,t=Re(e,yl),o=i.useContext(en),a=Ja(function(){return wl(o,t)},[o,t],function(s,l){return!r&&(s[0]!==l[0]||!Qi(s[1],l[1],!0))});return i.createElement(en.Provider,{value:a},n)}var Sl=[],_a=i.createContext(null);function ft(){return i.useContext(_a)}var ya=i.createContext(Sl);function Vn(e){var n=i.useContext(ya);return i.useMemo(function(){return e!==void 0?[].concat(sn(n),[e]):n},[n,e])}var wa=i.createContext(null),Ur=i.createContext({});function po(e){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;if(Qa(e)){var r=e.nodeName.toLowerCase(),t=["input","select","textarea","button"].includes(r)||e.isContentEditable||r==="a"&&!!e.getAttribute("href"),o=e.getAttribute("tabindex"),a=Number(o),s=null;return o&&!Number.isNaN(a)?s=a:t&&s===null&&(s=0),t&&e.disabled&&(s=null),s!==null&&(s>=0||n&&s<0)}return!1}function Cl(e){var n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1,r=sn(e.querySelectorAll("*")).filter(function(t){return po(t,n)});return po(e,n)&&r.unshift(e),r}var Ar=Ne.LEFT,kr=Ne.RIGHT,jr=Ne.UP,tt=Ne.DOWN,rt=Ne.ENTER,Sa=Ne.ESC,An=Ne.HOME,kn=Ne.END,mo=[jr,tt,Ar,kr];function $l(e,n,r,t){var o,a="prev",s="next",l="children",f="parent";if(e==="inline"&&t===rt)return{inlineTrigger:!0};var c=Z(Z({},jr,a),tt,s),d=Z(Z(Z(Z({},Ar,r?s:a),kr,r?a:s),tt,l),rt,l),u=Z(Z(Z(Z(Z(Z({},jr,a),tt,s),rt,l),Sa,f),Ar,r?l:f),kr,r?f:l),v={inline:c,horizontal:d,vertical:u,inlineSub:c,horizontalSub:u,verticalSub:u},w=(o=v["".concat(e).concat(n?"":"Sub")])===null||o===void 0?void 0:o[t];switch(w){case a:return{offset:-1,sibling:!0};case s:return{offset:1,sibling:!0};case f:return{offset:-1,sibling:!1};case l:return{offset:1,sibling:!1};default:return null}}function Rl(e){for(var n=e;n;){if(n.getAttribute("data-menu-list"))return n;n=n.parentElement}return null}function Il(e,n){for(var r=e||document.activeElement;r;){if(n.has(r))return r;r=r.parentElement}return null}function Gr(e,n){var r=Cl(e,!0);return r.filter(function(t){return n.has(t)})}function vo(e,n,r){var t=arguments.length>3&&arguments[3]!==void 0?arguments[3]:1;if(!e)return null;var o=Gr(e,n),a=o.length,s=o.findIndex(function(l){return r===l});return t<0?s===-1?s=a-1:s-=1:t>0&&(s+=1),s=(s+a)%a,o[s]}var zr=function(n,r){var t=new Set,o=new Map,a=new Map;return n.forEach(function(s){var l=document.querySelector("[data-menu-id='".concat(ha(r,s),"']"));l&&(t.add(l),a.set(l,s),o.set(s,l))}),{elements:t,key2element:o,element2key:a}};function El(e,n,r,t,o,a,s,l,f,c){var d=i.useRef(),u=i.useRef();u.current=n;var v=function(){on.cancel(d.current)};return i.useEffect(function(){return function(){v()}},[]),function(w){var x=w.which;if([].concat(mo,[rt,Sa,An,kn]).includes(x)){var I=a(),S=zr(I,t),$=S,m=$.elements,R=$.key2element,P=$.element2key,p=R.get(n),g=Il(p,m),C=P.get(g),b=$l(e,s(C,!0).length===1,r,x);if(!b&&x!==An&&x!==kn)return;(mo.includes(x)||[An,kn].includes(x))&&w.preventDefault();var y=function(q){if(q){var D=q,re=q.querySelector("a");re!=null&&re.getAttribute("href")&&(D=re);var M=P.get(q);l(M),v(),d.current=on(function(){u.current===M&&D.focus()})}};if([An,kn].includes(x)||b.sibling||!g){var O;!g||e==="inline"?O=o.current:O=Rl(g);var h,_=Gr(O,m);x===An?h=_[0]:x===kn?h=_[_.length-1]:h=vo(O,m,g,b.offset),y(h)}else if(b.inlineTrigger)f(C);else if(b.offset>0)f(C,!0),v(),d.current=on(function(){S=zr(I,t);var H=g.getAttribute("aria-controls"),q=document.getElementById(H),D=vo(q,S.elements);y(D)},5);else if(b.offset<0){var E=s(C,!0),T=E[E.length-2],B=R.get(T);f(T,!1),y(B)}}c==null||c(w)}}function Pl(e){Promise.resolve().then(e)}var Xr="__RC_UTIL_PATH_SPLIT__",bo=function(n){return n.join(Xr)},Ol=function(n){return n.split(Xr)},Lr="rc-menu-more";function Tl(){var e=i.useState({}),n=k(e,2),r=n[1],t=i.useRef(new Map),o=i.useRef(new Map),a=i.useState([]),s=k(a,2),l=s[0],f=s[1],c=i.useRef(0),d=i.useRef(!1),u=function(){d.current||r({})},v=i.useCallback(function(R,P){var p=bo(P);o.current.set(p,R),t.current.set(R,p),c.current+=1;var g=c.current;Pl(function(){g===c.current&&u()})},[]),w=i.useCallback(function(R,P){var p=bo(P);o.current.delete(p),t.current.delete(R)},[]),x=i.useCallback(function(R){f(R)},[]),I=i.useCallback(function(R,P){var p=t.current.get(R)||"",g=Ol(p);return P&&l.includes(g[0])&&g.unshift(Lr),g},[l]),S=i.useCallback(function(R,P){return R.filter(function(p){return p!==void 0}).some(function(p){var g=I(p,!0);return g.includes(P)})},[I]),$=function(){var P=sn(t.current.keys());return l.length&&P.push(Lr),P},m=i.useCallback(function(R){var P="".concat(t.current.get(R)).concat(Xr),p=new Set;return sn(o.current.keys()).forEach(function(g){g.startsWith(P)&&p.add(o.current.get(g))}),p},[]);return i.useEffect(function(){return function(){d.current=!0}},[]),{registerPath:v,unregisterPath:w,refreshOverflowKeys:x,isSubPathKey:S,getKeyPath:I,getKeys:$,getSubPathKeys:m}}function zn(e){var n=i.useRef(e);n.current=e;var r=i.useCallback(function(){for(var t,o=arguments.length,a=new Array(o),s=0;s<o;s++)a[s]=arguments[s];return(t=n.current)===null||t===void 0?void 0:t.call.apply(t,[n].concat(a))},[]);return e?r:void 0}var Ml=Math.random().toFixed(5).toString().slice(2),ho=0;function Nl(e){var n=In(e,{value:e}),r=k(n,2),t=r[0],o=r[1];return i.useEffect(function(){ho+=1;var a="".concat(Ml,"-").concat(ho);o("rc-menu-uuid-".concat(a))},[]),t}function Ca(e,n,r,t){var o=i.useContext(en),a=o.activeKey,s=o.onActive,l=o.onInactive,f={active:a===e};return n||(f.onMouseEnter=function(c){r==null||r({key:e,domEvent:c}),s(e)},f.onMouseLeave=function(c){t==null||t({key:e,domEvent:c}),l(e)}),f}function $a(e){var n=i.useContext(en),r=n.mode,t=n.rtl,o=n.inlineIndent;if(r!=="inline")return null;var a=e;return t?{paddingRight:a*o}:{paddingLeft:a*o}}function Ra(e){var n=e.icon,r=e.props,t=e.children,o;return n===null||n===!1?null:(typeof n=="function"?o=i.createElement(n,Q({},r)):typeof n!="boolean"&&(o=n),o||t||null)}var Al=["item"];function at(e){var n=e.item,r=Re(e,Al);return Object.defineProperty(r,"item",{get:function(){return ea(!1,"`info.item` is deprecated since we will move to function component that not provides React Node instance in future."),n}}),r}var kl=["title","attribute","elementRef"],jl=["style","className","eventKey","warnKey","disabled","itemIcon","children","role","onMouseEnter","onMouseLeave","onClick","onKeyDown","onFocus"],zl=["active"],Ll=function(e){es(r,e);var n=ns(r);function r(){return ts(this,r),n.apply(this,arguments)}return rs(r,[{key:"render",value:function(){var o=this.props,a=o.title,s=o.attribute,l=o.elementRef,f=Re(o,kl),c=Br(f,["eventKey","popupClassName","popupOffset","onTitleClick"]);return ea(!s,"`attribute` of Menu.Item is deprecated. Please pass attribute directly."),i.createElement(an.Item,ie({},s,{title:typeof a=="string"?a:void 0},c,{ref:l}))}}]),r}(i.Component),Dl=i.forwardRef(function(e,n){var r=e.style,t=e.className,o=e.eventKey;e.warnKey;var a=e.disabled,s=e.itemIcon,l=e.children,f=e.role,c=e.onMouseEnter,d=e.onMouseLeave,u=e.onClick,v=e.onKeyDown,w=e.onFocus,x=Re(e,jl),I=xa(o),S=i.useContext(en),$=S.prefixCls,m=S.onItemClick,R=S.disabled,P=S.overflowDisabled,p=S.itemIcon,g=S.selectedKeys,C=S.onActive,b=i.useContext(Ur),y=b._internalRenderMenuItem,O="".concat($,"-item"),h=i.useRef(),_=i.useRef(),E=R||a,T=na(n,_),B=Vn(o),H=function(W){return{key:o,keyPath:sn(B).reverse(),item:h.current,domEvent:W}},q=s||p,D=Ca(o,E,c,d),re=D.active,M=Re(D,zl),se=g.includes(o),le=$a(B.length),N=function(W){if(!E){var fe=H(W);u==null||u(at(fe)),m(fe)}},j=function(W){if(v==null||v(W),W.which===Ne.ENTER){var fe=H(W);u==null||u(at(fe)),m(fe)}},F=function(W){C(o),w==null||w(W)},Y={};e.role==="option"&&(Y["aria-selected"]=se);var ee=i.createElement(Ll,ie({ref:h,elementRef:T,role:f===null?"none":f||"menuitem",tabIndex:a?null:-1,"data-menu-id":P&&I?null:I},Br(x,["extra"]),M,Y,{component:"li","aria-disabled":a,style:Q(Q({},le),r),className:te(O,Z(Z(Z({},"".concat(O,"-active"),re),"".concat(O,"-selected"),se),"".concat(O,"-disabled"),E),t),onClick:N,onKeyDown:j,onFocus:F}),l,i.createElement(Ra,{props:Q(Q({},e),{},{isSelected:se}),icon:q}));return y&&(ee=y(ee,e,{selected:se})),ee});function ql(e,n){var r=e.eventKey,t=ft(),o=Vn(r);return i.useEffect(function(){if(t)return t.registerPath(r,o),function(){t.unregisterPath(r,o)}},[o]),t?null:i.createElement(Dl,ie({},e,{ref:n}))}const ut=i.forwardRef(ql);var Kl=["className","children"],Bl=function(n,r){var t=n.className,o=n.children,a=Re(n,Kl),s=i.useContext(en),l=s.prefixCls,f=s.mode,c=s.rtl;return i.createElement("ul",ie({className:te(l,c&&"".concat(l,"-rtl"),"".concat(l,"-sub"),"".concat(l,"-").concat(f==="inline"?"inline":"vertical"),t),role:"menu"},a,{"data-menu-list":!0,ref:r}),o)},Yr=i.forwardRef(Bl);Yr.displayName="SubMenuList";function Zr(e,n){return ta(e).map(function(r,t){if(i.isValidElement(r)){var o,a,s=r.key,l=(o=(a=r.props)===null||a===void 0?void 0:a.eventKey)!==null&&o!==void 0?o:s,f=l==null;f&&(l="tmp_key-".concat([].concat(sn(n),[t]).join("-")));var c={key:l,eventKey:l};return i.cloneElement(r,c)}return r})}var De={adjustX:1,adjustY:1},Fl={topLeft:{points:["bl","tl"],overflow:De},topRight:{points:["br","tr"],overflow:De},bottomLeft:{points:["tl","bl"],overflow:De},bottomRight:{points:["tr","br"],overflow:De},leftTop:{points:["tr","tl"],overflow:De},leftBottom:{points:["br","bl"],overflow:De},rightTop:{points:["tl","tr"],overflow:De},rightBottom:{points:["bl","br"],overflow:De}},Wl={topLeft:{points:["bl","tl"],overflow:De},topRight:{points:["br","tr"],overflow:De},bottomLeft:{points:["tl","bl"],overflow:De},bottomRight:{points:["tr","br"],overflow:De},rightTop:{points:["tr","tl"],overflow:De},rightBottom:{points:["br","bl"],overflow:De},leftTop:{points:["tl","tr"],overflow:De},leftBottom:{points:["bl","br"],overflow:De}};function Ia(e,n,r){if(n)return n;if(r)return r[e]||r.other}var Vl={horizontal:"bottomLeft",vertical:"rightTop","vertical-left":"rightTop","vertical-right":"leftTop"};function Hl(e){var n=e.prefixCls,r=e.visible,t=e.children,o=e.popup,a=e.popupStyle,s=e.popupClassName,l=e.popupOffset,f=e.disabled,c=e.mode,d=e.onVisibleChange,u=i.useContext(en),v=u.getPopupContainer,w=u.rtl,x=u.subMenuOpenDelay,I=u.subMenuCloseDelay,S=u.builtinPlacements,$=u.triggerSubMenuAction,m=u.forceSubMenuRender,R=u.rootClassName,P=u.motion,p=u.defaultMotions,g=i.useState(!1),C=k(g,2),b=C[0],y=C[1],O=w?Q(Q({},Wl),S):Q(Q({},Fl),S),h=Vl[c],_=Ia(c,P,p),E=i.useRef(_);c!=="inline"&&(E.current=_);var T=Q(Q({},E.current),{},{leavedClassName:"".concat(n,"-hidden"),removeOnLeave:!1,motionAppear:!0}),B=i.useRef();return i.useEffect(function(){return B.current=on(function(){y(r)}),function(){on.cancel(B.current)}},[r]),i.createElement(fa,{prefixCls:n,popupClassName:te("".concat(n,"-popup"),Z({},"".concat(n,"-rtl"),w),s,R),stretch:c==="horizontal"?"minWidth":null,getPopupContainer:v,builtinPlacements:O,popupPlacement:h,popupVisible:b,popup:o,popupStyle:a,popupAlign:l&&{offset:l},action:f?[]:[$],mouseEnterDelay:x,mouseLeaveDelay:I,onPopupVisibleChange:d,forceRender:m,popupMotion:T,fresh:!0},t)}function Ul(e){var n=e.id,r=e.open,t=e.keyPath,o=e.children,a="inline",s=i.useContext(en),l=s.prefixCls,f=s.forceSubMenuRender,c=s.motion,d=s.defaultMotions,u=s.mode,v=i.useRef(!1);v.current=u===a;var w=i.useState(!v.current),x=k(w,2),I=x[0],S=x[1],$=v.current?r:!1;i.useEffect(function(){v.current&&S(!1)},[u]);var m=Q({},Ia(a,c,d));t.length>1&&(m.motionAppear=!1);var R=m.onVisibleChanged;return m.onVisibleChanged=function(P){return!v.current&&!P&&S(!0),R==null?void 0:R(P)},I?null:i.createElement(Bn,{mode:a,locked:!v.current},i.createElement(Kr,ie({visible:$},m,{forceRender:f,removeOnLeave:!1,leavedClassName:"".concat(l,"-hidden")}),function(P){var p=P.className,g=P.style;return i.createElement(Yr,{id:n,className:p,style:g},o)}))}var Gl=["style","className","title","eventKey","warnKey","disabled","internalPopupClose","children","itemIcon","expandIcon","popupClassName","popupOffset","popupStyle","onClick","onMouseEnter","onMouseLeave","onTitleClick","onTitleMouseEnter","onTitleMouseLeave"],Xl=["active"],Yl=i.forwardRef(function(e,n){var r=e.style,t=e.className,o=e.title,a=e.eventKey;e.warnKey;var s=e.disabled,l=e.internalPopupClose,f=e.children,c=e.itemIcon,d=e.expandIcon,u=e.popupClassName,v=e.popupOffset,w=e.popupStyle,x=e.onClick,I=e.onMouseEnter,S=e.onMouseLeave,$=e.onTitleClick,m=e.onTitleMouseEnter,R=e.onTitleMouseLeave,P=Re(e,Gl),p=xa(a),g=i.useContext(en),C=g.prefixCls,b=g.mode,y=g.openKeys,O=g.disabled,h=g.overflowDisabled,_=g.activeKey,E=g.selectedKeys,T=g.itemIcon,B=g.expandIcon,H=g.onItemClick,q=g.onOpenChange,D=g.onActive,re=i.useContext(Ur),M=re._internalRenderSubMenuItem,se=i.useContext(wa),le=se.isSubPathKey,N=Vn(),j="".concat(C,"-submenu"),F=O||s,Y=i.useRef(),ee=i.useRef(),G=c??T,W=d??B,fe=y.includes(a),de=!h&&fe,Oe=le(E,a),Ie=Ca(a,F,m,R),X=Ie.active,z=Re(Ie,Xl),xe=i.useState(!1),L=k(xe,2),_e=L[0],ue=L[1],Ae=function(we){F||ue(we)},$e=function(we){Ae(!0),I==null||I({key:a,domEvent:we})},he=function(we){Ae(!1),S==null||S({key:a,domEvent:we})},U=i.useMemo(function(){return X||(b!=="inline"?_e||le([_],a):!1)},[b,X,_,_e,a,le]),qe=$a(N.length),Te=function(we){F||($==null||$({key:a,domEvent:we}),b==="inline"&&q(a,!fe))},Me=zn(function(ke){x==null||x(at(ke)),H(ke)}),Ye=function(we){b!=="inline"&&q(a,we)},me=function(){D(a)},ye=p&&"".concat(p,"-popup"),ze=i.useMemo(function(){return i.createElement(Ra,{icon:b!=="horizontal"?W:void 0,props:Q(Q({},e),{},{isOpen:de,isSubMenu:!0})},i.createElement("i",{className:"".concat(j,"-arrow")}))},[b,W,e,de,j]),ve=i.createElement("div",ie({role:"menuitem",style:qe,className:"".concat(j,"-title"),tabIndex:F?null:-1,ref:Y,title:typeof o=="string"?o:null,"data-menu-id":h&&p?null:p,"aria-expanded":de,"aria-haspopup":!0,"aria-controls":ye,"aria-disabled":F,onClick:Te,onFocus:me},z),o,ze),Be=i.useRef(b);if(b!=="inline"&&N.length>1?Be.current="vertical":Be.current=b,!h){var Ee=Be.current;ve=i.createElement(Hl,{mode:Ee,prefixCls:j,visible:!l&&de&&b!=="inline",popupClassName:u,popupOffset:v,popupStyle:w,popup:i.createElement(Bn,{mode:Ee==="horizontal"?"vertical":Ee},i.createElement(Yr,{id:ye,ref:ee},f)),disabled:F,onVisibleChange:Ye},ve)}var ae=i.createElement(an.Item,ie({ref:n,role:"none"},P,{component:"li",style:r,className:te(j,"".concat(j,"-").concat(b),t,Z(Z(Z(Z({},"".concat(j,"-open"),de),"".concat(j,"-active"),U),"".concat(j,"-selected"),Oe),"".concat(j,"-disabled"),F)),onMouseEnter:$e,onMouseLeave:he}),ve,!h&&i.createElement(Ul,{id:ye,open:de,keyPath:N},f));return M&&(ae=M(ae,e,{selected:Oe,active:U,open:de,disabled:F})),i.createElement(Bn,{onItemClick:Me,mode:b==="horizontal"?"vertical":b,itemIcon:G,expandIcon:W},ae)}),Jr=i.forwardRef(function(e,n){var r=e.eventKey,t=e.children,o=Vn(r),a=Zr(t,o),s=ft();i.useEffect(function(){if(s)return s.registerPath(r,o),function(){s.unregisterPath(r,o)}},[o]);var l;return s?l=a:l=i.createElement(Yl,ie({ref:n},e),a),i.createElement(ya.Provider,{value:o},l)});function Ea(e){var n=e.className,r=e.style,t=i.useContext(en),o=t.prefixCls,a=ft();return a?null:i.createElement("li",{role:"separator",className:te("".concat(o,"-item-divider"),n),style:r})}var Zl=["className","title","eventKey","children"],Jl=i.forwardRef(function(e,n){var r=e.className,t=e.title;e.eventKey;var o=e.children,a=Re(e,Zl),s=i.useContext(en),l=s.prefixCls,f="".concat(l,"-item-group");return i.createElement("li",ie({ref:n,role:"presentation"},a,{onClick:function(d){return d.stopPropagation()},className:te(f,r)}),i.createElement("div",{role:"presentation",className:"".concat(f,"-title"),title:typeof t=="string"?t:void 0},t),i.createElement("ul",{role:"group",className:"".concat(f,"-list")},o))}),Pa=i.forwardRef(function(e,n){var r=e.eventKey,t=e.children,o=Vn(r),a=Zr(t,o),s=ft();return s?a:i.createElement(Jl,ie({ref:n},Br(e,["warnKey"])),a)}),Ql=["label","children","key","type","extra"];function Dr(e,n,r){var t=n.item,o=n.group,a=n.submenu,s=n.divider;return(e||[]).map(function(l,f){if(l&&ct(l)==="object"){var c=l,d=c.label,u=c.children,v=c.key,w=c.type,x=c.extra,I=Re(c,Ql),S=v??"tmp-".concat(f);return u||w==="group"?w==="group"?i.createElement(o,ie({key:S},I,{title:d}),Dr(u,n,r)):i.createElement(a,ie({key:S},I,{title:d}),Dr(u,n,r)):w==="divider"?i.createElement(s,ie({key:S},I)):i.createElement(t,ie({key:S},I,{extra:x}),d,(!!x||x===0)&&i.createElement("span",{className:"".concat(r,"-item-extra")},x))}return null}).filter(function(l){return l})}function xo(e,n,r,t,o){var a=e,s=Q({divider:Ea,item:ut,group:Pa,submenu:Jr},t);return n&&(a=Dr(n,s,o)),Zr(a,r)}var ec=["prefixCls","rootClassName","style","className","tabIndex","items","children","direction","id","mode","inlineCollapsed","disabled","disabledOverflow","subMenuOpenDelay","subMenuCloseDelay","forceSubMenuRender","defaultOpenKeys","openKeys","activeKey","defaultActiveFirst","selectable","multiple","defaultSelectedKeys","selectedKeys","onSelect","onDeselect","inlineIndent","motion","defaultMotions","triggerSubMenuAction","builtinPlacements","itemIcon","expandIcon","overflowedIndicator","overflowedIndicatorPopupClassName","getPopupContainer","onClick","onOpenChange","onKeyDown","openAnimation","openTransitionName","_internalRenderMenuItem","_internalRenderSubMenuItem","_internalComponents"],pn=[],nc=i.forwardRef(function(e,n){var r,t=e,o=t.prefixCls,a=o===void 0?"rc-menu":o,s=t.rootClassName,l=t.style,f=t.className,c=t.tabIndex,d=c===void 0?0:c,u=t.items,v=t.children,w=t.direction,x=t.id,I=t.mode,S=I===void 0?"vertical":I,$=t.inlineCollapsed,m=t.disabled,R=t.disabledOverflow,P=t.subMenuOpenDelay,p=P===void 0?.1:P,g=t.subMenuCloseDelay,C=g===void 0?.1:g,b=t.forceSubMenuRender,y=t.defaultOpenKeys,O=t.openKeys,h=t.activeKey,_=t.defaultActiveFirst,E=t.selectable,T=E===void 0?!0:E,B=t.multiple,H=B===void 0?!1:B,q=t.defaultSelectedKeys,D=t.selectedKeys,re=t.onSelect,M=t.onDeselect,se=t.inlineIndent,le=se===void 0?24:se,N=t.motion,j=t.defaultMotions,F=t.triggerSubMenuAction,Y=F===void 0?"hover":F,ee=t.builtinPlacements,G=t.itemIcon,W=t.expandIcon,fe=t.overflowedIndicator,de=fe===void 0?"...":fe,Oe=t.overflowedIndicatorPopupClassName,Ie=t.getPopupContainer,X=t.onClick,z=t.onOpenChange,xe=t.onKeyDown;t.openAnimation,t.openTransitionName;var L=t._internalRenderMenuItem,_e=t._internalRenderSubMenuItem,ue=t._internalComponents,Ae=Re(t,ec),$e=i.useMemo(function(){return[xo(v,u,pn,ue,a),xo(v,u,pn,{},a)]},[v,u,ue]),he=k($e,2),U=he[0],qe=he[1],Te=i.useState(!1),Me=k(Te,2),Ye=Me[0],me=Me[1],ye=i.useRef(),ze=Nl(x),ve=w==="rtl",Be=In(y,{value:O,postState:function(ce){return ce||pn}}),Ee=k(Be,2),ae=Ee[0],ke=Ee[1],we=function(ce){var be=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1;function Ue(){ke(ce),z==null||z(ce)}be?Ui.flushSync(Ue):Ue()},fn=i.useState(ae),tn=k(fn,2),vn=tn[0],bn=tn[1],un=i.useRef(!1),hn=i.useMemo(function(){return(S==="inline"||S==="vertical")&&$?["vertical",$]:[S,!1]},[S,$]),xn=k(hn,2),Ze=xn[0],Fe=xn[1],Je=Ze==="inline",nn=i.useState(Ze),gn=k(nn,2),We=gn[0],ln=gn[1],Ve=i.useState(Fe),Xe=k(Ve,2),K=Xe[0],oe=Xe[1];i.useEffect(function(){ln(Ze),oe(Fe),un.current&&(Je?ke(vn):we(pn))},[Ze,Fe]);var Se=i.useState(0),je=k(Se,2),He=je[0],Un=je[1],cn=He>=U.length-1||We!=="horizontal"||R;i.useEffect(function(){Je&&bn(ae)},[ae]),i.useEffect(function(){return un.current=!0,function(){un.current=!1}},[]);var rn=Tl(),Gn=rn.registerPath,En=rn.unregisterPath,Xn=rn.refreshOverflowKeys,Yn=rn.isSubPathKey,pt=rn.getKeyPath,Pn=rn.getKeys,dn=rn.getSubPathKeys,On=i.useMemo(function(){return{registerPath:Gn,unregisterPath:En}},[Gn,En]),Tn=i.useMemo(function(){return{isSubPathKey:Yn}},[Yn]);i.useEffect(function(){Xn(cn?pn:U.slice(He+1).map(function(Ce){return Ce.key}))},[He,cn]);var Zn=In(h||_&&((r=U[0])===null||r===void 0?void 0:r.key),{value:h}),Mn=k(Zn,2),J=Mn[0],A=Mn[1],ne=zn(function(Ce){A(Ce)}),ge=zn(function(){A(void 0)});i.useImperativeHandle(n,function(){return{list:ye.current,focus:function(ce){var be,Ue=Pn(),Ge=zr(Ue,ze),et=Ge.elements,xt=Ge.key2element,Ga=Ge.element2key,lo=Gr(ye.current,et),co=J??(lo[0]?Ga.get(lo[0]):(be=U.find(function(Xa){return!Xa.props.disabled}))===null||be===void 0?void 0:be.key),Nn=xt.get(co);if(co&&Nn){var _t;Nn==null||(_t=Nn.focus)===null||_t===void 0||_t.call(Nn,ce)}}}});var pe=In(q||[],{value:D,postState:function(ce){return Array.isArray(ce)?ce:ce==null?pn:[ce]}}),Le=k(pe,2),Qe=Le[0],Jn=Le[1],mt=function(ce){if(T){var be=ce.key,Ue=Qe.includes(be),Ge;H?Ue?Ge=Qe.filter(function(xt){return xt!==be}):Ge=[].concat(sn(Qe),[be]):Ge=[be],Jn(Ge);var et=Q(Q({},ce),{},{selectedKeys:Ge});Ue?M==null||M(et):re==null||re(et)}!H&&ae.length&&We!=="inline"&&we(pn)},_n=zn(function(Ce){X==null||X(at(Ce)),mt(Ce)}),Qn=zn(function(Ce,ce){var be=ae.filter(function(Ge){return Ge!==Ce});if(ce)be.push(Ce);else if(We!=="inline"){var Ue=dn(Ce);be=be.filter(function(Ge){return!Ue.has(Ge)})}Qi(ae,be,!0)||we(be,!0)}),vt=function(ce,be){var Ue=be??!ae.includes(ce);Qn(ce,Ue)},bt=El(We,J,ve,ze,ye,Pn,pt,A,vt,xe);i.useEffect(function(){me(!0)},[]);var ht=i.useMemo(function(){return{_internalRenderMenuItem:L,_internalRenderSubMenuItem:_e}},[L,_e]),Ha=We!=="horizontal"||R?U:U.map(function(Ce,ce){return i.createElement(Bn,{key:Ce.key,overflowDisabled:ce>He},Ce)}),Ua=i.createElement(an,ie({id:x,ref:ye,prefixCls:"".concat(a,"-overflow"),component:"ul",itemComponent:ut,className:te(a,"".concat(a,"-root"),"".concat(a,"-").concat(We),f,Z(Z({},"".concat(a,"-inline-collapsed"),K),"".concat(a,"-rtl"),ve),s),dir:w,style:l,role:"menu",tabIndex:d,data:Ha,renderRawItem:function(ce){return ce},renderRawRest:function(ce){var be=ce.length,Ue=be?U.slice(-be):null;return i.createElement(Jr,{eventKey:Lr,title:de,disabled:cn,internalPopupClose:be===0,popupClassName:Oe},Ue)},maxCount:We!=="horizontal"||R?an.INVALIDATE:an.RESPONSIVE,ssr:"full","data-menu-list":!0,onVisibleChange:function(ce){Un(ce)},onKeyDown:bt},Ae));return i.createElement(Ur.Provider,{value:ht},i.createElement(ba.Provider,{value:ze},i.createElement(Bn,{prefixCls:a,rootClassName:s,mode:We,openKeys:ae,rtl:ve,disabled:m,motion:Ye?N:null,defaultMotions:Ye?j:null,activeKey:J,onActive:ne,onInactive:ge,selectedKeys:Qe,inlineIndent:le,subMenuOpenDelay:p,subMenuCloseDelay:C,forceSubMenuRender:b,builtinPlacements:ee,triggerSubMenuAction:Y,getPopupContainer:Ie,itemIcon:G,expandIcon:W,onItemClick:_n,onOpenChange:Qn},i.createElement(wa.Provider,{value:Tn},Ua),i.createElement("div",{style:{display:"none"},"aria-hidden":!0},i.createElement(_a.Provider,{value:On},qe)))))}),Hn=nc;Hn.Item=ut;Hn.SubMenu=Jr;Hn.ItemGroup=Pa;Hn.Divider=Ea;var tc={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M176 511a56 56 0 10112 0 56 56 0 10-112 0zm280 0a56 56 0 10112 0 56 56 0 10-112 0zm280 0a56 56 0 10112 0 56 56 0 10-112 0z"}}]},name:"ellipsis",theme:"outlined"},rc=function(n,r){return i.createElement(ra,ie({},n,{ref:r,icon:tc}))},oc=i.forwardRef(rc),ic={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M482 152h60q8 0 8 8v704q0 8-8 8h-60q-8 0-8-8V160q0-8 8-8z"}},{tag:"path",attrs:{d:"M192 474h672q8 0 8 8v60q0 8-8 8H160q-8 0-8-8v-60q0-8 8-8z"}}]},name:"plus",theme:"outlined"},ac=function(n,r){return i.createElement(ra,ie({},n,{ref:r,icon:ic}))},sc=i.forwardRef(ac);const gt=i.createContext(null);var lc=function(n){var r=n.activeTabOffset,t=n.horizontal,o=n.rtl,a=n.indicator,s=a===void 0?{}:a,l=s.size,f=s.align,c=f===void 0?"center":f,d=i.useState(),u=k(d,2),v=u[0],w=u[1],x=i.useRef(),I=Pe.useCallback(function($){return typeof l=="function"?l($):typeof l=="number"?l:$},[l]);function S(){on.cancel(x.current)}return i.useEffect(function(){var $={};if(r)if(t){$.width=I(r.width);var m=o?"right":"left";c==="start"&&($[m]=r[m]),c==="center"&&($[m]=r[m]+r.width/2,$.transform=o?"translateX(50%)":"translateX(-50%)"),c==="end"&&($[m]=r[m]+r.width,$.transform="translateX(-100%)")}else $.height=I(r.height),c==="start"&&($.top=r.top),c==="center"&&($.top=r.top+r.height/2,$.transform="translateY(-50%)"),c==="end"&&($.top=r.top+r.height,$.transform="translateY(-100%)");return S(),x.current=on(function(){var R=v&&$&&Object.keys($).every(function(P){var p=$[P],g=v[P];return typeof p=="number"&&typeof g=="number"?Math.round(p)===Math.round(g):p===g});R||w($)}),S},[JSON.stringify(r),t,o,c,I]),{style:v}},_o={width:0,height:0,left:0,top:0};function cc(e,n,r){return i.useMemo(function(){for(var t,o=new Map,a=n.get((t=e[0])===null||t===void 0?void 0:t.key)||_o,s=a.left+a.width,l=0;l<e.length;l+=1){var f=e[l].key,c=n.get(f);if(!c){var d;c=n.get((d=e[l-1])===null||d===void 0?void 0:d.key)||_o}var u=o.get(f)||Q({},c);u.right=s-u.left-u.width,o.set(f,u)}return o},[e.map(function(t){return t.key}).join("_"),n,r])}function yo(e,n){var r=i.useRef(e),t=i.useState({}),o=k(t,2),a=o[1];function s(l){var f=typeof l=="function"?l(r.current):l;f!==r.current&&n(f,r.current),r.current=f,a({})}return[r.current,s]}var fc=.1,wo=.01,ot=20,So=Math.pow(.995,ot);function uc(e,n){var r=i.useState(),t=k(r,2),o=t[0],a=t[1],s=i.useState(0),l=k(s,2),f=l[0],c=l[1],d=i.useState(0),u=k(d,2),v=u[0],w=u[1],x=i.useState(),I=k(x,2),S=I[0],$=I[1],m=i.useRef();function R(y){var O=y.touches[0],h=O.screenX,_=O.screenY;a({x:h,y:_}),window.clearInterval(m.current)}function P(y){if(o){var O=y.touches[0],h=O.screenX,_=O.screenY;a({x:h,y:_});var E=h-o.x,T=_-o.y;n(E,T);var B=Date.now();c(B),w(B-f),$({x:E,y:T})}}function p(){if(o&&(a(null),$(null),S)){var y=S.x/v,O=S.y/v,h=Math.abs(y),_=Math.abs(O);if(Math.max(h,_)<fc)return;var E=y,T=O;m.current=window.setInterval(function(){if(Math.abs(E)<wo&&Math.abs(T)<wo){window.clearInterval(m.current);return}E*=So,T*=So,n(E*ot,T*ot)},ot)}}var g=i.useRef();function C(y){var O=y.deltaX,h=y.deltaY,_=0,E=Math.abs(O),T=Math.abs(h);E===T?_=g.current==="x"?O:h:E>T?(_=O,g.current="x"):(_=h,g.current="y"),n(-_,-_)&&y.preventDefault()}var b=i.useRef(null);b.current={onTouchStart:R,onTouchMove:P,onTouchEnd:p,onWheel:C},i.useEffect(function(){function y(E){b.current.onTouchStart(E)}function O(E){b.current.onTouchMove(E)}function h(E){b.current.onTouchEnd(E)}function _(E){b.current.onWheel(E)}return document.addEventListener("touchmove",O,{passive:!1}),document.addEventListener("touchend",h,{passive:!0}),e.current.addEventListener("touchstart",y,{passive:!0}),e.current.addEventListener("wheel",_,{passive:!1}),function(){document.removeEventListener("touchmove",O),document.removeEventListener("touchend",h)}},[])}function Oa(e){var n=i.useState(0),r=k(n,2),t=r[0],o=r[1],a=i.useRef(0),s=i.useRef();return s.current=e,os(function(){var l;(l=s.current)===null||l===void 0||l.call(s)},[t]),function(){a.current===t&&(a.current+=1,o(a.current))}}function gc(e){var n=i.useRef([]),r=i.useState({}),t=k(r,2),o=t[1],a=i.useRef(typeof e=="function"?e():e),s=Oa(function(){var f=a.current;n.current.forEach(function(c){f=c(f)}),n.current=[],a.current=f,o({})});function l(f){n.current.push(f),s()}return[a.current,l]}var Co={width:0,height:0,left:0,top:0,right:0};function dc(e,n,r,t,o,a,s){var l=s.tabs,f=s.tabPosition,c=s.rtl,d,u,v;return["top","bottom"].includes(f)?(d="width",u=c?"right":"left",v=Math.abs(r)):(d="height",u="top",v=-r),i.useMemo(function(){if(!l.length)return[0,0];for(var w=l.length,x=w,I=0;I<w;I+=1){var S=e.get(l[I].key)||Co;if(Math.floor(S[u]+S[d])>Math.floor(v+n)){x=I-1;break}}for(var $=0,m=w-1;m>=0;m-=1){var R=e.get(l[m].key)||Co;if(R[u]<v){$=m+1;break}}return $>x?[0,-1]:[$,x]},[e,n,t,o,a,v,f,l.map(function(w){return w.key}).join("_"),c])}function $o(e){var n;return e instanceof Map?(n={},e.forEach(function(r,t){n[t]=r})):n=e,JSON.stringify(n)}var pc="TABS_DQ";function Ta(e){return String(e).replace(/"/g,pc)}function Qr(e,n,r,t){return!(!r||t||e===!1||e===void 0&&(n===!1||n===null))}var Ma=i.forwardRef(function(e,n){var r=e.prefixCls,t=e.editable,o=e.locale,a=e.style;return!t||t.showAdd===!1?null:i.createElement("button",{ref:n,type:"button",className:"".concat(r,"-nav-add"),style:a,"aria-label":(o==null?void 0:o.addAriaLabel)||"Add tab",onClick:function(l){t.onEdit("add",{event:l})}},t.addIcon||"+")}),Ro=i.forwardRef(function(e,n){var r=e.position,t=e.prefixCls,o=e.extra;if(!o)return null;var a,s={};return ct(o)==="object"&&!i.isValidElement(o)?s=o:s.right=o,r==="right"&&(a=s.right),r==="left"&&(a=s.left),a?i.createElement("div",{className:"".concat(t,"-extra-content"),ref:n},a):null}),mc=i.forwardRef(function(e,n){var r=e.prefixCls,t=e.id,o=e.tabs,a=e.locale,s=e.mobile,l=e.more,f=l===void 0?{}:l,c=e.style,d=e.className,u=e.editable,v=e.tabBarGutter,w=e.rtl,x=e.removeAriaLabel,I=e.onTabClick,S=e.getPopupContainer,$=e.popupClassName,m=i.useState(!1),R=k(m,2),P=R[0],p=R[1],g=i.useState(null),C=k(g,2),b=C[0],y=C[1],O=f.icon,h=O===void 0?"More":O,_="".concat(t,"-more-popup"),E="".concat(r,"-dropdown"),T=b!==null?"".concat(_,"-").concat(b):null,B=a==null?void 0:a.dropdownAriaLabel;function H(N,j){N.preventDefault(),N.stopPropagation(),u.onEdit("remove",{key:j,event:N})}var q=i.createElement(Hn,{onClick:function(j){var F=j.key,Y=j.domEvent;I(F,Y),p(!1)},prefixCls:"".concat(E,"-menu"),id:_,tabIndex:-1,role:"listbox","aria-activedescendant":T,selectedKeys:[b],"aria-label":B!==void 0?B:"expanded dropdown"},o.map(function(N){var j=N.closable,F=N.disabled,Y=N.closeIcon,ee=N.key,G=N.label,W=Qr(j,Y,u,F);return i.createElement(ut,{key:ee,id:"".concat(_,"-").concat(ee),role:"option","aria-controls":t&&"".concat(t,"-panel-").concat(ee),disabled:F},i.createElement("span",null,G),W&&i.createElement("button",{type:"button","aria-label":x||"remove",tabIndex:0,className:"".concat(E,"-menu-item-remove"),onClick:function(de){de.stopPropagation(),H(de,ee)}},Y||u.removeIcon||"×"))}));function D(N){for(var j=o.filter(function(W){return!W.disabled}),F=j.findIndex(function(W){return W.key===b})||0,Y=j.length,ee=0;ee<Y;ee+=1){F=(F+N+Y)%Y;var G=j[F];if(!G.disabled){y(G.key);return}}}function re(N){var j=N.which;if(!P){[Ne.DOWN,Ne.SPACE,Ne.ENTER].includes(j)&&(p(!0),N.preventDefault());return}switch(j){case Ne.UP:D(-1),N.preventDefault();break;case Ne.DOWN:D(1),N.preventDefault();break;case Ne.ESC:p(!1);break;case Ne.SPACE:case Ne.ENTER:b!==null&&I(b,N);break}}i.useEffect(function(){var N=document.getElementById(T);N&&N.scrollIntoView&&N.scrollIntoView(!1)},[b]),i.useEffect(function(){P||y(null)},[P]);var M=Z({},w?"marginRight":"marginLeft",v);o.length||(M.visibility="hidden",M.order=1);var se=te(Z({},"".concat(E,"-rtl"),w)),le=s?null:i.createElement(_l,ie({prefixCls:E,overlay:q,visible:o.length?P:!1,onVisibleChange:p,overlayClassName:te(se,$),mouseEnterDelay:.1,mouseLeaveDelay:.1,getPopupContainer:S},f),i.createElement("button",{type:"button",className:"".concat(r,"-nav-more"),style:M,"aria-haspopup":"listbox","aria-controls":_,id:"".concat(t,"-more"),"aria-expanded":P,onKeyDown:re},h));return i.createElement("div",{className:te("".concat(r,"-nav-operations"),d),style:c,ref:n},le,i.createElement(Ma,{prefixCls:r,locale:a,editable:u}))});const vc=i.memo(mc,function(e,n){return n.tabMoving});var bc=function(n){var r=n.prefixCls,t=n.id,o=n.active,a=n.focus,s=n.tab,l=s.key,f=s.label,c=s.disabled,d=s.closeIcon,u=s.icon,v=n.closable,w=n.renderWrapper,x=n.removeAriaLabel,I=n.editable,S=n.onClick,$=n.onFocus,m=n.onBlur,R=n.onKeyDown,P=n.onMouseDown,p=n.onMouseUp,g=n.style,C=n.tabCount,b=n.currentPosition,y="".concat(r,"-tab"),O=Qr(v,d,I,c);function h(H){c||S(H)}function _(H){H.preventDefault(),H.stopPropagation(),I.onEdit("remove",{key:l,event:H})}var E=i.useMemo(function(){return u&&typeof f=="string"?i.createElement("span",null,f):f},[f,u]),T=i.useRef(null);i.useEffect(function(){a&&T.current&&T.current.focus()},[a]);var B=i.createElement("div",{key:l,"data-node-key":Ta(l),className:te(y,Z(Z(Z(Z({},"".concat(y,"-with-remove"),O),"".concat(y,"-active"),o),"".concat(y,"-disabled"),c),"".concat(y,"-focus"),a)),style:g,onClick:h},i.createElement("div",{ref:T,role:"tab","aria-selected":o,id:t&&"".concat(t,"-tab-").concat(l),className:"".concat(y,"-btn"),"aria-controls":t&&"".concat(t,"-panel-").concat(l),"aria-disabled":c,tabIndex:c?null:o?0:-1,onClick:function(q){q.stopPropagation(),h(q)},onKeyDown:R,onMouseDown:P,onMouseUp:p,onFocus:$,onBlur:m},a&&i.createElement("div",{"aria-live":"polite",style:{width:0,height:0,position:"absolute",overflow:"hidden",opacity:0}},"Tab ".concat(b," of ").concat(C)),u&&i.createElement("span",{className:"".concat(y,"-icon")},u),f&&E),O&&i.createElement("button",{type:"button",role:"tab","aria-label":x||"remove",tabIndex:o?0:-1,className:"".concat(y,"-remove"),onClick:function(q){q.stopPropagation(),_(q)}},d||I.removeIcon||"×"));return w?w(B):B},hc=function(n,r){var t=n.offsetWidth,o=n.offsetHeight,a=n.offsetTop,s=n.offsetLeft,l=n.getBoundingClientRect(),f=l.width,c=l.height,d=l.left,u=l.top;return Math.abs(f-t)<1?[f,c,d-r.left,u-r.top]:[t,o,s,a]},$n=function(n){var r=n.current||{},t=r.offsetWidth,o=t===void 0?0:t,a=r.offsetHeight,s=a===void 0?0:a;if(n.current){var l=n.current.getBoundingClientRect(),f=l.width,c=l.height;if(Math.abs(f-o)<1)return[f,c]}return[o,s]},nt=function(n,r){return n[r?0:1]},Io=i.forwardRef(function(e,n){var r=e.className,t=e.style,o=e.id,a=e.animated,s=e.activeKey,l=e.rtl,f=e.extra,c=e.editable,d=e.locale,u=e.tabPosition,v=e.tabBarGutter,w=e.children,x=e.onTabClick,I=e.onTabScroll,S=e.indicator,$=i.useContext(gt),m=$.prefixCls,R=$.tabs,P=i.useRef(null),p=i.useRef(null),g=i.useRef(null),C=i.useRef(null),b=i.useRef(null),y=i.useRef(null),O=i.useRef(null),h=u==="top"||u==="bottom",_=yo(0,function(J,A){h&&I&&I({direction:J>A?"left":"right"})}),E=k(_,2),T=E[0],B=E[1],H=yo(0,function(J,A){!h&&I&&I({direction:J>A?"top":"bottom"})}),q=k(H,2),D=q[0],re=q[1],M=i.useState([0,0]),se=k(M,2),le=se[0],N=se[1],j=i.useState([0,0]),F=k(j,2),Y=F[0],ee=F[1],G=i.useState([0,0]),W=k(G,2),fe=W[0],de=W[1],Oe=i.useState([0,0]),Ie=k(Oe,2),X=Ie[0],z=Ie[1],xe=gc(new Map),L=k(xe,2),_e=L[0],ue=L[1],Ae=cc(R,_e,Y[0]),$e=nt(le,h),he=nt(Y,h),U=nt(fe,h),qe=nt(X,h),Te=Math.floor($e)<Math.floor(he+U),Me=Te?$e-qe:$e-U,Ye="".concat(m,"-nav-operations-hidden"),me=0,ye=0;h&&l?(me=0,ye=Math.max(0,he-Me)):(me=Math.min(0,Me-he),ye=0);function ze(J){return J<me?me:J>ye?ye:J}var ve=i.useRef(null),Be=i.useState(),Ee=k(Be,2),ae=Ee[0],ke=Ee[1];function we(){ke(Date.now())}function fn(){ve.current&&clearTimeout(ve.current)}uc(C,function(J,A){function ne(ge,pe){ge(function(Le){var Qe=ze(Le+pe);return Qe})}return Te?(h?ne(B,J):ne(re,A),fn(),we(),!0):!1}),i.useEffect(function(){return fn(),ae&&(ve.current=setTimeout(function(){ke(0)},100)),fn},[ae]);var tn=dc(Ae,Me,h?T:D,he,U,qe,Q(Q({},e),{},{tabs:R})),vn=k(tn,2),bn=vn[0],un=vn[1],hn=Hi(function(){var J=arguments.length>0&&arguments[0]!==void 0?arguments[0]:s,A=Ae.get(J)||{width:0,height:0,left:0,right:0,top:0};if(h){var ne=T;l?A.right<T?ne=A.right:A.right+A.width>T+Me&&(ne=A.right+A.width-Me):A.left<-T?ne=-A.left:A.left+A.width>-T+Me&&(ne=-(A.left+A.width-Me)),re(0),B(ze(ne))}else{var ge=D;A.top<-D?ge=-A.top:A.top+A.height>-D+Me&&(ge=-(A.top+A.height-Me)),B(0),re(ze(ge))}}),xn=i.useState(),Ze=k(xn,2),Fe=Ze[0],Je=Ze[1],nn=i.useState(!1),gn=k(nn,2),We=gn[0],ln=gn[1],Ve=R.filter(function(J){return!J.disabled}).map(function(J){return J.key}),Xe=function(A){var ne=Ve.indexOf(Fe||s),ge=Ve.length,pe=(ne+A+ge)%ge,Le=Ve[pe];Je(Le)},K=function(A,ne){var ge=Ve.indexOf(A),pe=R.find(function(Qe){return Qe.key===A}),Le=Qr(pe==null?void 0:pe.closable,pe==null?void 0:pe.closeIcon,c,pe==null?void 0:pe.disabled);Le&&(ne.preventDefault(),ne.stopPropagation(),c.onEdit("remove",{key:A,event:ne}),ge===Ve.length-1?Xe(-1):Xe(1))},oe=function(A,ne){ln(!0),ne.button===1&&K(A,ne)},Se=function(A){var ne=A.code,ge=l&&h,pe=Ve[0],Le=Ve[Ve.length-1];switch(ne){case"ArrowLeft":{h&&Xe(ge?1:-1);break}case"ArrowRight":{h&&Xe(ge?-1:1);break}case"ArrowUp":{A.preventDefault(),h||Xe(-1);break}case"ArrowDown":{A.preventDefault(),h||Xe(1);break}case"Home":{A.preventDefault(),Je(pe);break}case"End":{A.preventDefault(),Je(Le);break}case"Enter":case"Space":{A.preventDefault(),x(Fe??s,A);break}case"Backspace":case"Delete":{K(Fe,A);break}}},je={};h?je[l?"marginRight":"marginLeft"]=v:je.marginTop=v;var He=R.map(function(J,A){var ne=J.key;return i.createElement(bc,{id:o,prefixCls:m,key:ne,tab:J,style:A===0?void 0:je,closable:J.closable,editable:c,active:ne===s,focus:ne===Fe,renderWrapper:w,removeAriaLabel:d==null?void 0:d.removeAriaLabel,tabCount:Ve.length,currentPosition:A+1,onClick:function(pe){x(ne,pe)},onKeyDown:Se,onFocus:function(){We||Je(ne),hn(ne),we(),C.current&&(l||(C.current.scrollLeft=0),C.current.scrollTop=0)},onBlur:function(){Je(void 0)},onMouseDown:function(pe){return oe(ne,pe)},onMouseUp:function(){ln(!1)}})}),Un=function(){return ue(function(){var A,ne=new Map,ge=(A=b.current)===null||A===void 0?void 0:A.getBoundingClientRect();return R.forEach(function(pe){var Le,Qe=pe.key,Jn=(Le=b.current)===null||Le===void 0?void 0:Le.querySelector('[data-node-key="'.concat(Ta(Qe),'"]'));if(Jn){var mt=hc(Jn,ge),_n=k(mt,4),Qn=_n[0],vt=_n[1],bt=_n[2],ht=_n[3];ne.set(Qe,{width:Qn,height:vt,left:bt,top:ht})}}),ne})};i.useEffect(function(){Un()},[R.map(function(J){return J.key}).join("_")]);var cn=Oa(function(){var J=$n(P),A=$n(p),ne=$n(g);N([J[0]-A[0]-ne[0],J[1]-A[1]-ne[1]]);var ge=$n(O);de(ge);var pe=$n(y);z(pe);var Le=$n(b);ee([Le[0]-ge[0],Le[1]-ge[1]]),Un()}),rn=R.slice(0,bn),Gn=R.slice(un+1),En=[].concat(sn(rn),sn(Gn)),Xn=Ae.get(s),Yn=lc({activeTabOffset:Xn,horizontal:h,indicator:S,rtl:l}),pt=Yn.style;i.useEffect(function(){hn()},[s,me,ye,$o(Xn),$o(Ae),h]),i.useEffect(function(){cn()},[l]);var Pn=!!En.length,dn="".concat(m,"-nav-wrap"),On,Tn,Zn,Mn;return h?l?(Tn=T>0,On=T!==ye):(On=T<0,Tn=T!==me):(Zn=D<0,Mn=D!==me),i.createElement(Kn,{onResize:cn},i.createElement("div",{ref:na(n,P),role:"tablist","aria-orientation":h?"horizontal":"vertical",className:te("".concat(m,"-nav"),r),style:t,onKeyDown:function(){we()}},i.createElement(Ro,{ref:p,position:"left",extra:f,prefixCls:m}),i.createElement(Kn,{onResize:cn},i.createElement("div",{className:te(dn,Z(Z(Z(Z({},"".concat(dn,"-ping-left"),On),"".concat(dn,"-ping-right"),Tn),"".concat(dn,"-ping-top"),Zn),"".concat(dn,"-ping-bottom"),Mn)),ref:C},i.createElement(Kn,{onResize:cn},i.createElement("div",{ref:b,className:"".concat(m,"-nav-list"),style:{transform:"translate(".concat(T,"px, ").concat(D,"px)"),transition:ae?"none":void 0}},He,i.createElement(Ma,{ref:O,prefixCls:m,locale:d,editable:c,style:Q(Q({},He.length===0?void 0:je),{},{visibility:Pn?"hidden":null})}),i.createElement("div",{className:te("".concat(m,"-ink-bar"),Z({},"".concat(m,"-ink-bar-animated"),a.inkBar)),style:pt}))))),i.createElement(vc,ie({},e,{removeAriaLabel:d==null?void 0:d.removeAriaLabel,ref:y,prefixCls:m,tabs:En,className:!Pn&&Ye,tabMoving:!!ae})),i.createElement(Ro,{ref:g,position:"right",extra:f,prefixCls:m})))}),Na=i.forwardRef(function(e,n){var r=e.prefixCls,t=e.className,o=e.style,a=e.id,s=e.active,l=e.tabKey,f=e.children;return i.createElement("div",{id:a&&"".concat(a,"-panel-").concat(l),role:"tabpanel",tabIndex:s?0:-1,"aria-labelledby":a&&"".concat(a,"-tab-").concat(l),"aria-hidden":!s,style:o,className:te(r,s&&"".concat(r,"-active"),t),ref:n},f)}),xc=["renderTabBar"],_c=["label","key"],yc=function(n){var r=n.renderTabBar,t=Re(n,xc),o=i.useContext(gt),a=o.tabs;if(r){var s=Q(Q({},t),{},{panes:a.map(function(l){var f=l.label,c=l.key,d=Re(l,_c);return i.createElement(Na,ie({tab:f,key:c,tabKey:c},d))})});return r(s,Io)}return i.createElement(Io,t)},wc=["key","forceRender","style","className","destroyInactiveTabPane"],Sc=function(n){var r=n.id,t=n.activeKey,o=n.animated,a=n.tabPosition,s=n.destroyInactiveTabPane,l=i.useContext(gt),f=l.prefixCls,c=l.tabs,d=o.tabPane,u="".concat(f,"-tabpane");return i.createElement("div",{className:te("".concat(f,"-content-holder"))},i.createElement("div",{className:te("".concat(f,"-content"),"".concat(f,"-content-").concat(a),Z({},"".concat(f,"-content-animated"),d))},c.map(function(v){var w=v.key,x=v.forceRender,I=v.style,S=v.className,$=v.destroyInactiveTabPane,m=Re(v,wc),R=w===t;return i.createElement(Kr,ie({key:w,visible:R,forceRender:x,removeOnLeave:!!(s||$),leavedClassName:"".concat(u,"-hidden")},o.tabPaneMotion),function(P,p){var g=P.style,C=P.className;return i.createElement(Na,ie({},m,{prefixCls:u,id:r,tabKey:w,animated:d,active:R,style:Q(Q({},I),g),className:te(S,C),ref:p}))})})))};function Cc(){var e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{inkBar:!0,tabPane:!1},n;return e===!1?n={inkBar:!1,tabPane:!1}:e===!0?n={inkBar:!0,tabPane:!1}:n=Q({inkBar:!0},ct(e)==="object"?e:{}),n.tabPaneMotion&&n.tabPane===void 0&&(n.tabPane=!0),!n.tabPaneMotion&&n.tabPane&&(n.tabPane=!1),n}var $c=["id","prefixCls","className","items","direction","activeKey","defaultActiveKey","editable","animated","tabPosition","tabBarGutter","tabBarStyle","tabBarExtraContent","locale","more","destroyInactiveTabPane","renderTabBar","onChange","onTabClick","onTabScroll","getPopupContainer","popupClassName","indicator"],Eo=0,Rc=i.forwardRef(function(e,n){var r=e.id,t=e.prefixCls,o=t===void 0?"rc-tabs":t,a=e.className,s=e.items,l=e.direction,f=e.activeKey,c=e.defaultActiveKey,d=e.editable,u=e.animated,v=e.tabPosition,w=v===void 0?"top":v,x=e.tabBarGutter,I=e.tabBarStyle,S=e.tabBarExtraContent,$=e.locale,m=e.more,R=e.destroyInactiveTabPane,P=e.renderTabBar,p=e.onChange,g=e.onTabClick,C=e.onTabScroll,b=e.getPopupContainer,y=e.popupClassName,O=e.indicator,h=Re(e,$c),_=i.useMemo(function(){return(s||[]).filter(function(X){return X&&ct(X)==="object"&&"key"in X})},[s]),E=l==="rtl",T=Cc(u),B=i.useState(!1),H=k(B,2),q=H[0],D=H[1];i.useEffect(function(){D($s())},[]);var re=In(function(){var X;return(X=_[0])===null||X===void 0?void 0:X.key},{value:f,defaultValue:c}),M=k(re,2),se=M[0],le=M[1],N=i.useState(function(){return _.findIndex(function(X){return X.key===se})}),j=k(N,2),F=j[0],Y=j[1];i.useEffect(function(){var X=_.findIndex(function(xe){return xe.key===se});if(X===-1){var z;X=Math.max(0,Math.min(F,_.length-1)),le((z=_[X])===null||z===void 0?void 0:z.key)}Y(X)},[_.map(function(X){return X.key}).join("_"),se,F]);var ee=In(null,{value:r}),G=k(ee,2),W=G[0],fe=G[1];i.useEffect(function(){r||(fe("rc-tabs-".concat(Eo)),Eo+=1)},[]);function de(X,z){g==null||g(X,z);var xe=X!==se;le(X),xe&&(p==null||p(X))}var Oe={id:W,activeKey:se,animated:T,tabPosition:w,rtl:E,mobile:q},Ie=Q(Q({},Oe),{},{editable:d,locale:$,more:m,tabBarGutter:x,onTabClick:de,onTabScroll:C,extra:S,style:I,panes:null,getPopupContainer:b,popupClassName:y,indicator:O});return i.createElement(gt.Provider,{value:{tabs:_,prefixCls:o}},i.createElement("div",ie({ref:n,id:r,className:te(o,"".concat(o,"-").concat(w),Z(Z(Z({},"".concat(o,"-mobile"),q),"".concat(o,"-editable"),d),"".concat(o,"-rtl"),E),a)},h),i.createElement(yc,ie({},Ie,{renderTabBar:P})),i.createElement(Sc,ie({destroyInactiveTabPane:R},Oe,{animated:T}))))});const Ic={motionAppear:!1,motionEnter:!0,motionLeave:!0};function Ec(e,n={inkBar:!0,tabPane:!1}){let r;return n===!1?r={inkBar:!1,tabPane:!1}:n===!0?r={inkBar:!0,tabPane:!0}:r=Object.assign({inkBar:!0},typeof n=="object"?n:{}),r.tabPane&&(r.tabPaneMotion=Object.assign(Object.assign({},Ic),{motionName:is(e,"switch")})),r}var Pc=function(e,n){var r={};for(var t in e)Object.prototype.hasOwnProperty.call(e,t)&&n.indexOf(t)<0&&(r[t]=e[t]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var o=0,t=Object.getOwnPropertySymbols(e);o<t.length;o++)n.indexOf(t[o])<0&&Object.prototype.propertyIsEnumerable.call(e,t[o])&&(r[t[o]]=e[t[o]]);return r};function Oc(e){return e.filter(n=>n)}function Tc(e,n){if(e)return e.map(t=>{var o;const a=(o=t.destroyOnHidden)!==null&&o!==void 0?o:t.destroyInactiveTabPane;return Object.assign(Object.assign({},t),{destroyInactiveTabPane:a})});const r=ta(n).map(t=>{if(i.isValidElement(t)){const{key:o,props:a}=t,s=a||{},{tab:l}=s,f=Pc(s,["tab"]);return Object.assign(Object.assign({key:String(o)},f),{label:l})}return null});return Oc(r)}const Mc=e=>{const{componentCls:n,motionDurationSlow:r}=e;return[{[n]:{[`${n}-switch`]:{"&-appear, &-enter":{transition:"none","&-start":{opacity:0},"&-active":{opacity:1,transition:`opacity ${r}`}},"&-leave":{position:"absolute",transition:"none",inset:0,"&-start":{opacity:1},"&-active":{opacity:0,transition:`opacity ${r}`}}}}},[uo(e,"slide-up"),uo(e,"slide-down")]]},Nc=e=>{const{componentCls:n,tabsCardPadding:r,cardBg:t,cardGutter:o,colorBorderSecondary:a,itemSelectedColor:s}=e;return{[`${n}-card`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab`]:{margin:0,padding:r,background:t,border:`${V(e.lineWidth)} ${e.lineType} ${a}`,transition:`all ${e.motionDurationSlow} ${e.motionEaseInOut}`},[`${n}-tab-active`]:{color:s,background:e.colorBgContainer},[`${n}-tab-focus:has(${n}-tab-btn:focus-visible)`]:oa(e,-3),[`& ${n}-tab${n}-tab-focus ${n}-tab-btn:focus-visible`]:{outline:"none"},[`${n}-ink-bar`]:{visibility:"hidden"}},[`&${n}-top, &${n}-bottom`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab + ${n}-tab`]:{marginLeft:{_skip_check_:!0,value:V(o)}}}},[`&${n}-top`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab`]:{borderRadius:`${V(e.borderRadiusLG)} ${V(e.borderRadiusLG)} 0 0`},[`${n}-tab-active`]:{borderBottomColor:e.colorBgContainer}}},[`&${n}-bottom`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab`]:{borderRadius:`0 0 ${V(e.borderRadiusLG)} ${V(e.borderRadiusLG)}`},[`${n}-tab-active`]:{borderTopColor:e.colorBgContainer}}},[`&${n}-left, &${n}-right`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab + ${n}-tab`]:{marginTop:V(o)}}},[`&${n}-left`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab`]:{borderRadius:{_skip_check_:!0,value:`${V(e.borderRadiusLG)} 0 0 ${V(e.borderRadiusLG)}`}},[`${n}-tab-active`]:{borderRightColor:{_skip_check_:!0,value:e.colorBgContainer}}}},[`&${n}-right`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab`]:{borderRadius:{_skip_check_:!0,value:`0 ${V(e.borderRadiusLG)} ${V(e.borderRadiusLG)} 0`}},[`${n}-tab-active`]:{borderLeftColor:{_skip_check_:!0,value:e.colorBgContainer}}}}}}},Ac=e=>{const{componentCls:n,itemHoverColor:r,dropdownEdgeChildVerticalPadding:t}=e;return{[`${n}-dropdown`]:Object.assign(Object.assign({},st(e)),{position:"absolute",top:-9999,left:{_skip_check_:!0,value:-9999},zIndex:e.zIndexPopup,display:"block","&-hidden":{display:"none"},[`${n}-dropdown-menu`]:{maxHeight:e.tabsDropdownHeight,margin:0,padding:`${V(t)} 0`,overflowX:"hidden",overflowY:"auto",textAlign:{_skip_check_:!0,value:"left"},listStyleType:"none",backgroundColor:e.colorBgContainer,backgroundClip:"padding-box",borderRadius:e.borderRadiusLG,outline:"none",boxShadow:e.boxShadowSecondary,"&-item":Object.assign(Object.assign({},as),{display:"flex",alignItems:"center",minWidth:e.tabsDropdownWidth,margin:0,padding:`${V(e.paddingXXS)} ${V(e.paddingSM)}`,color:e.colorText,fontWeight:"normal",fontSize:e.fontSize,lineHeight:e.lineHeight,cursor:"pointer",transition:`all ${e.motionDurationSlow}`,"> span":{flex:1,whiteSpace:"nowrap"},"&-remove":{flex:"none",marginLeft:{_skip_check_:!0,value:e.marginSM},color:e.colorIcon,fontSize:e.fontSizeSM,background:"transparent",border:0,cursor:"pointer","&:hover":{color:r}},"&:hover":{background:e.controlItemBgHover},"&-disabled":{"&, &:hover":{color:e.colorTextDisabled,background:"transparent",cursor:"not-allowed"}}})}})}},kc=e=>{const{componentCls:n,margin:r,colorBorderSecondary:t,horizontalMargin:o,verticalItemPadding:a,verticalItemMargin:s,calc:l}=e;return{[`${n}-top, ${n}-bottom`]:{flexDirection:"column",[`> ${n}-nav, > div > ${n}-nav`]:{margin:o,"&::before":{position:"absolute",right:{_skip_check_:!0,value:0},left:{_skip_check_:!0,value:0},borderBottom:`${V(e.lineWidth)} ${e.lineType} ${t}`,content:"''"},[`${n}-ink-bar`]:{height:e.lineWidthBold,"&-animated":{transition:`width ${e.motionDurationSlow}, left ${e.motionDurationSlow},
            right ${e.motionDurationSlow}`}},[`${n}-nav-wrap`]:{"&::before, &::after":{top:0,bottom:0,width:e.controlHeight},"&::before":{left:{_skip_check_:!0,value:0},boxShadow:e.boxShadowTabsOverflowLeft},"&::after":{right:{_skip_check_:!0,value:0},boxShadow:e.boxShadowTabsOverflowRight},[`&${n}-nav-wrap-ping-left::before`]:{opacity:1},[`&${n}-nav-wrap-ping-right::after`]:{opacity:1}}}},[`${n}-top`]:{[`> ${n}-nav,
        > div > ${n}-nav`]:{"&::before":{bottom:0},[`${n}-ink-bar`]:{bottom:0}}},[`${n}-bottom`]:{[`> ${n}-nav, > div > ${n}-nav`]:{order:1,marginTop:r,marginBottom:0,"&::before":{top:0},[`${n}-ink-bar`]:{top:0}},[`> ${n}-content-holder, > div > ${n}-content-holder`]:{order:0}},[`${n}-left, ${n}-right`]:{[`> ${n}-nav, > div > ${n}-nav`]:{flexDirection:"column",minWidth:l(e.controlHeight).mul(1.25).equal(),[`${n}-tab`]:{padding:a,textAlign:"center"},[`${n}-tab + ${n}-tab`]:{margin:s},[`${n}-nav-wrap`]:{flexDirection:"column","&::before, &::after":{right:{_skip_check_:!0,value:0},left:{_skip_check_:!0,value:0},height:e.controlHeight},"&::before":{top:0,boxShadow:e.boxShadowTabsOverflowTop},"&::after":{bottom:0,boxShadow:e.boxShadowTabsOverflowBottom},[`&${n}-nav-wrap-ping-top::before`]:{opacity:1},[`&${n}-nav-wrap-ping-bottom::after`]:{opacity:1}},[`${n}-ink-bar`]:{width:e.lineWidthBold,"&-animated":{transition:`height ${e.motionDurationSlow}, top ${e.motionDurationSlow}`}},[`${n}-nav-list, ${n}-nav-operations`]:{flex:"1 0 auto",flexDirection:"column"}}},[`${n}-left`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-ink-bar`]:{right:{_skip_check_:!0,value:0}}},[`> ${n}-content-holder, > div > ${n}-content-holder`]:{marginLeft:{_skip_check_:!0,value:V(l(e.lineWidth).mul(-1).equal())},borderLeft:{_skip_check_:!0,value:`${V(e.lineWidth)} ${e.lineType} ${e.colorBorder}`},[`> ${n}-content > ${n}-tabpane`]:{paddingLeft:{_skip_check_:!0,value:e.paddingLG}}}},[`${n}-right`]:{[`> ${n}-nav, > div > ${n}-nav`]:{order:1,[`${n}-ink-bar`]:{left:{_skip_check_:!0,value:0}}},[`> ${n}-content-holder, > div > ${n}-content-holder`]:{order:0,marginRight:{_skip_check_:!0,value:l(e.lineWidth).mul(-1).equal()},borderRight:{_skip_check_:!0,value:`${V(e.lineWidth)} ${e.lineType} ${e.colorBorder}`},[`> ${n}-content > ${n}-tabpane`]:{paddingRight:{_skip_check_:!0,value:e.paddingLG}}}}}},jc=e=>{const{componentCls:n,cardPaddingSM:r,cardPaddingLG:t,cardHeightSM:o,cardHeightLG:a,horizontalItemPaddingSM:s,horizontalItemPaddingLG:l}=e;return{[n]:{"&-small":{[`> ${n}-nav`]:{[`${n}-tab`]:{padding:s,fontSize:e.titleFontSizeSM}}},"&-large":{[`> ${n}-nav`]:{[`${n}-tab`]:{padding:l,fontSize:e.titleFontSizeLG,lineHeight:e.lineHeightLG}}}},[`${n}-card`]:{[`&${n}-small`]:{[`> ${n}-nav`]:{[`${n}-tab`]:{padding:r},[`${n}-nav-add`]:{minWidth:o,minHeight:o}},[`&${n}-bottom`]:{[`> ${n}-nav ${n}-tab`]:{borderRadius:`0 0 ${V(e.borderRadius)} ${V(e.borderRadius)}`}},[`&${n}-top`]:{[`> ${n}-nav ${n}-tab`]:{borderRadius:`${V(e.borderRadius)} ${V(e.borderRadius)} 0 0`}},[`&${n}-right`]:{[`> ${n}-nav ${n}-tab`]:{borderRadius:{_skip_check_:!0,value:`0 ${V(e.borderRadius)} ${V(e.borderRadius)} 0`}}},[`&${n}-left`]:{[`> ${n}-nav ${n}-tab`]:{borderRadius:{_skip_check_:!0,value:`${V(e.borderRadius)} 0 0 ${V(e.borderRadius)}`}}}},[`&${n}-large`]:{[`> ${n}-nav`]:{[`${n}-tab`]:{padding:t},[`${n}-nav-add`]:{minWidth:a,minHeight:a}}}}}},zc=e=>{const{componentCls:n,itemActiveColor:r,itemHoverColor:t,iconCls:o,tabsHorizontalItemMargin:a,horizontalItemPadding:s,itemSelectedColor:l,itemColor:f}=e,c=`${n}-tab`;return{[c]:{position:"relative",WebkitTouchCallout:"none",WebkitTapHighlightColor:"transparent",display:"inline-flex",alignItems:"center",padding:s,fontSize:e.titleFontSize,background:"transparent",border:0,outline:"none",cursor:"pointer",color:f,"&-btn, &-remove":{"&:focus:not(:focus-visible), &:active":{color:r}},"&-btn":{outline:"none",transition:`all ${e.motionDurationSlow}`,[`${c}-icon:not(:last-child)`]:{marginInlineEnd:e.marginSM}},"&-remove":Object.assign({flex:"none",lineHeight:1,marginRight:{_skip_check_:!0,value:e.calc(e.marginXXS).mul(-1).equal()},marginLeft:{_skip_check_:!0,value:e.marginXS},color:e.colorIcon,fontSize:e.fontSizeSM,background:"transparent",border:"none",outline:"none",cursor:"pointer",transition:`all ${e.motionDurationSlow}`,"&:hover":{color:e.colorTextHeading}},Nr(e)),"&:hover":{color:t},[`&${c}-active ${c}-btn`]:{color:l,textShadow:e.tabsActiveTextShadow},[`&${c}-focus ${c}-btn:focus-visible`]:oa(e),[`&${c}-disabled`]:{color:e.colorTextDisabled,cursor:"not-allowed"},[`&${c}-disabled ${c}-btn, &${c}-disabled ${n}-remove`]:{"&:focus, &:active":{color:e.colorTextDisabled}},[`& ${c}-remove ${o}`]:{margin:0,verticalAlign:"middle"},[`${o}:not(:last-child)`]:{marginRight:{_skip_check_:!0,value:e.marginSM}}},[`${c} + ${c}`]:{margin:{_skip_check_:!0,value:a}}}},Lc=e=>{const{componentCls:n,tabsHorizontalItemMarginRTL:r,iconCls:t,cardGutter:o,calc:a}=e;return{[`${n}-rtl`]:{direction:"rtl",[`${n}-nav`]:{[`${n}-tab`]:{margin:{_skip_check_:!0,value:r},[`${n}-tab:last-of-type`]:{marginLeft:{_skip_check_:!0,value:0}},[t]:{marginRight:{_skip_check_:!0,value:0},marginLeft:{_skip_check_:!0,value:V(e.marginSM)}},[`${n}-tab-remove`]:{marginRight:{_skip_check_:!0,value:V(e.marginXS)},marginLeft:{_skip_check_:!0,value:V(a(e.marginXXS).mul(-1).equal())},[t]:{margin:0}}}},[`&${n}-left`]:{[`> ${n}-nav`]:{order:1},[`> ${n}-content-holder`]:{order:0}},[`&${n}-right`]:{[`> ${n}-nav`]:{order:0},[`> ${n}-content-holder`]:{order:1}},[`&${n}-card${n}-top, &${n}-card${n}-bottom`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-tab + ${n}-tab`]:{marginRight:{_skip_check_:!0,value:o},marginLeft:{_skip_check_:!0,value:0}}}}},[`${n}-dropdown-rtl`]:{direction:"rtl"},[`${n}-menu-item`]:{[`${n}-dropdown-rtl`]:{textAlign:{_skip_check_:!0,value:"right"}}}}},Dc=e=>{const{componentCls:n,tabsCardPadding:r,cardHeight:t,cardGutter:o,itemHoverColor:a,itemActiveColor:s,colorBorderSecondary:l}=e;return{[n]:Object.assign(Object.assign(Object.assign(Object.assign({},st(e)),{display:"flex",[`> ${n}-nav, > div > ${n}-nav`]:{position:"relative",display:"flex",flex:"none",alignItems:"center",[`${n}-nav-wrap`]:{position:"relative",display:"flex",flex:"auto",alignSelf:"stretch",overflow:"hidden",whiteSpace:"nowrap",transform:"translate(0)","&::before, &::after":{position:"absolute",zIndex:1,opacity:0,transition:`opacity ${e.motionDurationSlow}`,content:"''",pointerEvents:"none"}},[`${n}-nav-list`]:{position:"relative",display:"flex",transition:`opacity ${e.motionDurationSlow}`},[`${n}-nav-operations`]:{display:"flex",alignSelf:"stretch"},[`${n}-nav-operations-hidden`]:{position:"absolute",visibility:"hidden",pointerEvents:"none"},[`${n}-nav-more`]:{position:"relative",padding:r,background:"transparent",border:0,color:e.colorText,"&::after":{position:"absolute",right:{_skip_check_:!0,value:0},bottom:0,left:{_skip_check_:!0,value:0},height:e.calc(e.controlHeightLG).div(8).equal(),transform:"translateY(100%)",content:"''"}},[`${n}-nav-add`]:Object.assign({minWidth:t,minHeight:t,marginLeft:{_skip_check_:!0,value:o},background:"transparent",border:`${V(e.lineWidth)} ${e.lineType} ${l}`,borderRadius:`${V(e.borderRadiusLG)} ${V(e.borderRadiusLG)} 0 0`,outline:"none",cursor:"pointer",color:e.colorText,transition:`all ${e.motionDurationSlow} ${e.motionEaseInOut}`,"&:hover":{color:a},"&:active, &:focus:not(:focus-visible)":{color:s}},Nr(e,-3))},[`${n}-extra-content`]:{flex:"none"},[`${n}-ink-bar`]:{position:"absolute",background:e.inkBarColor,pointerEvents:"none"}}),zc(e)),{[`${n}-content`]:{position:"relative",width:"100%"},[`${n}-content-holder`]:{flex:"auto",minWidth:0,minHeight:0},[`${n}-tabpane`]:Object.assign(Object.assign({},Nr(e)),{"&-hidden":{display:"none"}})}),[`${n}-centered`]:{[`> ${n}-nav, > div > ${n}-nav`]:{[`${n}-nav-wrap`]:{[`&:not([class*='${n}-nav-wrap-ping']) > ${n}-nav-list`]:{margin:"auto"}}}}}},qc=e=>{const{cardHeight:n,cardHeightSM:r,cardHeightLG:t,controlHeight:o,controlHeightLG:a}=e,s=n||a,l=r||o,f=t||a+8;return{zIndexPopup:e.zIndexPopupBase+50,cardBg:e.colorFillAlter,cardHeight:s,cardHeightSM:l,cardHeightLG:f,cardPadding:`${(s-e.fontHeight)/2-e.lineWidth}px ${e.padding}px`,cardPaddingSM:`${(l-e.fontHeight)/2-e.lineWidth}px ${e.paddingXS}px`,cardPaddingLG:`${(f-e.fontHeightLG)/2-e.lineWidth}px ${e.padding}px`,titleFontSize:e.fontSize,titleFontSizeLG:e.fontSizeLG,titleFontSizeSM:e.fontSize,inkBarColor:e.colorPrimary,horizontalMargin:`0 0 ${e.margin}px 0`,horizontalItemGutter:32,horizontalItemMargin:"",horizontalItemMarginRTL:"",horizontalItemPadding:`${e.paddingSM}px 0`,horizontalItemPaddingSM:`${e.paddingXS}px 0`,horizontalItemPaddingLG:`${e.padding}px 0`,verticalItemPadding:`${e.paddingXS}px ${e.paddingLG}px`,verticalItemMargin:`${e.margin}px 0 0 0`,itemColor:e.colorText,itemSelectedColor:e.colorPrimary,itemHoverColor:e.colorPrimaryHover,itemActiveColor:e.colorPrimaryActive,cardGutter:e.marginXXS/2}},Kc=qr("Tabs",e=>{const n=Gi(e,{tabsCardPadding:e.cardPadding,dropdownEdgeChildVerticalPadding:e.paddingXXS,tabsActiveTextShadow:"0 0 0.25px currentcolor",tabsDropdownHeight:200,tabsDropdownWidth:120,tabsHorizontalItemMargin:`0 0 0 ${V(e.horizontalItemGutter)}`,tabsHorizontalItemMarginRTL:`0 0 0 ${V(e.horizontalItemGutter)}`});return[jc(n),Lc(n),kc(n),Ac(n),Nc(n),Dc(n),Mc(n)]},qc),Bc=()=>null;var Fc=function(e,n){var r={};for(var t in e)Object.prototype.hasOwnProperty.call(e,t)&&n.indexOf(t)<0&&(r[t]=e[t]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var o=0,t=Object.getOwnPropertySymbols(e);o<t.length;o++)n.indexOf(t[o])<0&&Object.prototype.propertyIsEnumerable.call(e,t[o])&&(r[t[o]]=e[t[o]]);return r};const Wc=i.forwardRef((e,n)=>{var r,t,o,a,s,l,f,c,d,u,v;const{type:w,className:x,rootClassName:I,size:S,onEdit:$,hideAdd:m,centered:R,addIcon:P,removeIcon:p,moreIcon:g,more:C,popupClassName:b,children:y,items:O,animated:h,style:_,indicatorSize:E,indicator:T,destroyInactiveTabPane:B,destroyOnHidden:H}=e,q=Fc(e,["type","className","rootClassName","size","onEdit","hideAdd","centered","addIcon","removeIcon","moreIcon","more","popupClassName","children","items","animated","style","indicatorSize","indicator","destroyInactiveTabPane","destroyOnHidden"]),{prefixCls:D}=q,{direction:re,tabs:M,getPrefixCls:se,getPopupContainer:le}=i.useContext(lt),N=se("tabs",D),j=ss(N),[F,Y,ee]=Kc(N,j),G=i.useRef(null);i.useImperativeHandle(n,()=>({nativeElement:G.current}));let W;w==="editable-card"&&(W={onEdit:(xe,{key:L,event:_e})=>{$==null||$(xe==="add"?_e:L,xe)},removeIcon:(r=p??(M==null?void 0:M.removeIcon))!==null&&r!==void 0?r:i.createElement(ls,null),addIcon:(P??(M==null?void 0:M.addIcon))||i.createElement(sc,null),showAdd:m!==!0});const fe=se(),de=cs(S),Oe=Tc(O,y),Ie=Ec(N,h),X=Object.assign(Object.assign({},M==null?void 0:M.style),_),z={align:(t=T==null?void 0:T.align)!==null&&t!==void 0?t:(o=M==null?void 0:M.indicator)===null||o===void 0?void 0:o.align,size:(f=(s=(a=T==null?void 0:T.size)!==null&&a!==void 0?a:E)!==null&&s!==void 0?s:(l=M==null?void 0:M.indicator)===null||l===void 0?void 0:l.size)!==null&&f!==void 0?f:M==null?void 0:M.indicatorSize};return F(i.createElement(Rc,Object.assign({ref:G,direction:re,getPopupContainer:le},q,{items:Oe,className:te({[`${N}-${de}`]:de,[`${N}-card`]:["card","editable-card"].includes(w),[`${N}-editable-card`]:w==="editable-card",[`${N}-centered`]:R},M==null?void 0:M.className,x,I,Y,ee,j),popupClassName:te(b,Y,ee,j),style:X,editable:W,more:Object.assign({icon:(v=(u=(d=(c=M==null?void 0:M.more)===null||c===void 0?void 0:c.icon)!==null&&d!==void 0?d:M==null?void 0:M.moreIcon)!==null&&u!==void 0?u:g)!==null&&v!==void 0?v:i.createElement(oc,null),transitionName:`${fe}-slide-up`},C),prefixCls:N,animated:Ie,indicator:z,destroyInactiveTabPane:H??B})))}),Vc=Wc;Vc.TabPane=Bc;var yt,Po;function Hc(){if(Po)return yt;Po=1;var e=Fr();function n(){this.__data__=new e,this.size=0}return yt=n,yt}var wt,Oo;function Uc(){if(Oo)return wt;Oo=1;function e(n){var r=this.__data__,t=r.delete(n);return this.size=r.size,t}return wt=e,wt}var St,To;function Gc(){if(To)return St;To=1;function e(n){return this.__data__.get(n)}return St=e,St}var Ct,Mo;function Xc(){if(Mo)return Ct;Mo=1;function e(n){return this.__data__.has(n)}return Ct=e,Ct}var $t,No;function Yc(){if(No)return $t;No=1;var e=Fr(),n=ia(),r=fs(),t=200;function o(a,s){var l=this.__data__;if(l instanceof e){var f=l.__data__;if(!n||f.length<t-1)return f.push([a,s]),this.size=++l.size,this;l=this.__data__=new r(f)}return l.set(a,s),this.size=l.size,this}return $t=o,$t}var Rt,Ao;function Zc(){if(Ao)return Rt;Ao=1;var e=Fr(),n=Hc(),r=Uc(),t=Gc(),o=Xc(),a=Yc();function s(l){var f=this.__data__=new e(l);this.size=f.size}return s.prototype.clear=n,s.prototype.delete=r,s.prototype.get=t,s.prototype.has=o,s.prototype.set=a,Rt=s,Rt}var It,ko;function Jc(){if(ko)return It;ko=1;function e(n,r){for(var t=-1,o=n==null?0:n.length;++t<o&&r(n[t],t,n)!==!1;);return n}return It=e,It}var Et,jo;function Qc(){if(jo)return Et;jo=1;var e=Fn(),n=function(){try{var r=e(Object,"defineProperty");return r({},"",{}),r}catch{}}();return Et=n,Et}var Pt,zo;function Aa(){if(zo)return Pt;zo=1;var e=Qc();function n(r,t,o){t=="__proto__"&&e?e(r,t,{configurable:!0,enumerable:!0,value:o,writable:!0}):r[t]=o}return Pt=n,Pt}var Ot,Lo;function ka(){if(Lo)return Ot;Lo=1;var e=Aa(),n=us(),r=Object.prototype,t=r.hasOwnProperty;function o(a,s,l){var f=a[s];(!(t.call(a,s)&&n(f,l))||l===void 0&&!(s in a))&&e(a,s,l)}return Ot=o,Ot}var Tt,Do;function dt(){if(Do)return Tt;Do=1;var e=ka(),n=Aa();function r(t,o,a,s){var l=!a;a||(a={});for(var f=-1,c=o.length;++f<c;){var d=o[f],u=s?s(a[d],t[d],d,a,t):void 0;u===void 0&&(u=t[d]),l?n(a,d,u):e(a,d,u)}return a}return Tt=r,Tt}var Mt,qo;function ef(){if(qo)return Mt;qo=1;function e(n,r){for(var t=-1,o=Array(n);++t<n;)o[t]=r(t);return o}return Mt=e,Mt}var Nt,Ko;function nf(){if(Ko)return Nt;Ko=1;var e=Wr(),n=Wn(),r="[object Arguments]";function t(o){return n(o)&&e(o)==r}return Nt=t,Nt}var At,Bo;function tf(){if(Bo)return At;Bo=1;var e=nf(),n=Wn(),r=Object.prototype,t=r.hasOwnProperty,o=r.propertyIsEnumerable,a=e(function(){return arguments}())?e:function(s){return n(s)&&t.call(s,"callee")&&!o.call(s,"callee")};return At=a,At}var Ln={exports:{}},kt,Fo;function rf(){if(Fo)return kt;Fo=1;function e(){return!1}return kt=e,kt}Ln.exports;var Wo;function ja(){return Wo||(Wo=1,function(e,n){var r=mn(),t=rf(),o=n&&!n.nodeType&&n,a=o&&!0&&e&&!e.nodeType&&e,s=a&&a.exports===o,l=s?r.Buffer:void 0,f=l?l.isBuffer:void 0,c=f||t;e.exports=c}(Ln,Ln.exports)),Ln.exports}var jt,Vo;function of(){if(Vo)return jt;Vo=1;var e=9007199254740991,n=/^(?:0|[1-9]\d*)$/;function r(t,o){var a=typeof t;return o=o??e,!!o&&(a=="number"||a!="symbol"&&n.test(t))&&t>-1&&t%1==0&&t<o}return jt=r,jt}var zt,Ho;function za(){if(Ho)return zt;Ho=1;var e=9007199254740991;function n(r){return typeof r=="number"&&r>-1&&r%1==0&&r<=e}return zt=n,zt}var Lt,Uo;function af(){if(Uo)return Lt;Uo=1;var e=Wr(),n=za(),r=Wn(),t="[object Arguments]",o="[object Array]",a="[object Boolean]",s="[object Date]",l="[object Error]",f="[object Function]",c="[object Map]",d="[object Number]",u="[object Object]",v="[object RegExp]",w="[object Set]",x="[object String]",I="[object WeakMap]",S="[object ArrayBuffer]",$="[object DataView]",m="[object Float32Array]",R="[object Float64Array]",P="[object Int8Array]",p="[object Int16Array]",g="[object Int32Array]",C="[object Uint8Array]",b="[object Uint8ClampedArray]",y="[object Uint16Array]",O="[object Uint32Array]",h={};h[m]=h[R]=h[P]=h[p]=h[g]=h[C]=h[b]=h[y]=h[O]=!0,h[t]=h[o]=h[S]=h[a]=h[$]=h[s]=h[l]=h[f]=h[c]=h[d]=h[u]=h[v]=h[w]=h[x]=h[I]=!1;function _(E){return r(E)&&n(E.length)&&!!h[e(E)]}return Lt=_,Lt}var Dt,Go;function eo(){if(Go)return Dt;Go=1;function e(n){return function(r){return n(r)}}return Dt=e,Dt}var Dn={exports:{}};Dn.exports;var Xo;function no(){return Xo||(Xo=1,function(e,n){var r=gs(),t=n&&!n.nodeType&&n,o=t&&!0&&e&&!e.nodeType&&e,a=o&&o.exports===t,s=a&&r.process,l=function(){try{var f=o&&o.require&&o.require("util").types;return f||s&&s.binding&&s.binding("util")}catch{}}();e.exports=l}(Dn,Dn.exports)),Dn.exports}var qt,Yo;function sf(){if(Yo)return qt;Yo=1;var e=af(),n=eo(),r=no(),t=r&&r.isTypedArray,o=t?n(t):e;return qt=o,qt}var Kt,Zo;function La(){if(Zo)return Kt;Zo=1;var e=ef(),n=tf(),r=Vr(),t=ja(),o=of(),a=sf(),s=Object.prototype,l=s.hasOwnProperty;function f(c,d){var u=r(c),v=!u&&n(c),w=!u&&!v&&t(c),x=!u&&!v&&!w&&a(c),I=u||v||w||x,S=I?e(c.length,String):[],$=S.length;for(var m in c)(d||l.call(c,m))&&!(I&&(m=="length"||w&&(m=="offset"||m=="parent")||x&&(m=="buffer"||m=="byteLength"||m=="byteOffset")||o(m,$)))&&S.push(m);return S}return Kt=f,Kt}var Bt,Jo;function to(){if(Jo)return Bt;Jo=1;var e=Object.prototype;function n(r){var t=r&&r.constructor,o=typeof t=="function"&&t.prototype||e;return r===o}return Bt=n,Bt}var Ft,Qo;function Da(){if(Qo)return Ft;Qo=1;function e(n,r){return function(t){return n(r(t))}}return Ft=e,Ft}var Wt,ei;function lf(){if(ei)return Wt;ei=1;var e=Da(),n=e(Object.keys,Object);return Wt=n,Wt}var Vt,ni;function cf(){if(ni)return Vt;ni=1;var e=to(),n=lf(),r=Object.prototype,t=r.hasOwnProperty;function o(a){if(!e(a))return n(a);var s=[];for(var l in Object(a))t.call(a,l)&&l!="constructor"&&s.push(l);return s}return Vt=o,Vt}var Ht,ti;function qa(){if(ti)return Ht;ti=1;var e=ds(),n=za();function r(t){return t!=null&&n(t.length)&&!e(t)}return Ht=r,Ht}var Ut,ri;function ro(){if(ri)return Ut;ri=1;var e=La(),n=cf(),r=qa();function t(o){return r(o)?e(o):n(o)}return Ut=t,Ut}var Gt,oi;function ff(){if(oi)return Gt;oi=1;var e=dt(),n=ro();function r(t,o){return t&&e(o,n(o),t)}return Gt=r,Gt}var Xt,ii;function uf(){if(ii)return Xt;ii=1;function e(n){var r=[];if(n!=null)for(var t in Object(n))r.push(t);return r}return Xt=e,Xt}var Yt,ai;function gf(){if(ai)return Yt;ai=1;var e=Hr(),n=to(),r=uf(),t=Object.prototype,o=t.hasOwnProperty;function a(s){if(!e(s))return r(s);var l=n(s),f=[];for(var c in s)c=="constructor"&&(l||!o.call(s,c))||f.push(c);return f}return Yt=a,Yt}var Zt,si;function oo(){if(si)return Zt;si=1;var e=La(),n=gf(),r=qa();function t(o){return r(o)?e(o,!0):n(o)}return Zt=t,Zt}var Jt,li;function df(){if(li)return Jt;li=1;var e=dt(),n=oo();function r(t,o){return t&&e(o,n(o),t)}return Jt=r,Jt}var qn={exports:{}};qn.exports;var ci;function pf(){return ci||(ci=1,function(e,n){var r=mn(),t=n&&!n.nodeType&&n,o=t&&!0&&e&&!e.nodeType&&e,a=o&&o.exports===t,s=a?r.Buffer:void 0,l=s?s.allocUnsafe:void 0;function f(c,d){if(d)return c.slice();var u=c.length,v=l?l(u):new c.constructor(u);return c.copy(v),v}e.exports=f}(qn,qn.exports)),qn.exports}var Qt,fi;function mf(){if(fi)return Qt;fi=1;function e(n,r){var t=-1,o=n.length;for(r||(r=Array(o));++t<o;)r[t]=n[t];return r}return Qt=e,Qt}var er,ui;function vf(){if(ui)return er;ui=1;function e(n,r){for(var t=-1,o=n==null?0:n.length,a=0,s=[];++t<o;){var l=n[t];r(l,t,n)&&(s[a++]=l)}return s}return er=e,er}var nr,gi;function Ka(){if(gi)return nr;gi=1;function e(){return[]}return nr=e,nr}var tr,di;function io(){if(di)return tr;di=1;var e=vf(),n=Ka(),r=Object.prototype,t=r.propertyIsEnumerable,o=Object.getOwnPropertySymbols,a=o?function(s){return s==null?[]:(s=Object(s),e(o(s),function(l){return t.call(s,l)}))}:n;return tr=a,tr}var rr,pi;function bf(){if(pi)return rr;pi=1;var e=dt(),n=io();function r(t,o){return e(t,n(t),o)}return rr=r,rr}var or,mi;function Ba(){if(mi)return or;mi=1;function e(n,r){for(var t=-1,o=r.length,a=n.length;++t<o;)n[a+t]=r[t];return n}return or=e,or}var ir,vi;function Fa(){if(vi)return ir;vi=1;var e=Da(),n=e(Object.getPrototypeOf,Object);return ir=n,ir}var ar,bi;function Wa(){if(bi)return ar;bi=1;var e=Ba(),n=Fa(),r=io(),t=Ka(),o=Object.getOwnPropertySymbols,a=o?function(s){for(var l=[];s;)e(l,r(s)),s=n(s);return l}:t;return ar=a,ar}var sr,hi;function hf(){if(hi)return sr;hi=1;var e=dt(),n=Wa();function r(t,o){return e(t,n(t),o)}return sr=r,sr}var lr,xi;function Va(){if(xi)return lr;xi=1;var e=Ba(),n=Vr();function r(t,o,a){var s=o(t);return n(t)?s:e(s,a(t))}return lr=r,lr}var cr,_i;function xf(){if(_i)return cr;_i=1;var e=Va(),n=io(),r=ro();function t(o){return e(o,r,n)}return cr=t,cr}var fr,yi;function _f(){if(yi)return fr;yi=1;var e=Va(),n=Wa(),r=oo();function t(o){return e(o,r,n)}return fr=t,fr}var ur,wi;function yf(){if(wi)return ur;wi=1;var e=Fn(),n=mn(),r=e(n,"DataView");return ur=r,ur}var gr,Si;function wf(){if(Si)return gr;Si=1;var e=Fn(),n=mn(),r=e(n,"Promise");return gr=r,gr}var dr,Ci;function Sf(){if(Ci)return dr;Ci=1;var e=Fn(),n=mn(),r=e(n,"Set");return dr=r,dr}var pr,$i;function Cf(){if($i)return pr;$i=1;var e=Fn(),n=mn(),r=e(n,"WeakMap");return pr=r,pr}var mr,Ri;function ao(){if(Ri)return mr;Ri=1;var e=yf(),n=ia(),r=wf(),t=Sf(),o=Cf(),a=Wr(),s=ps(),l="[object Map]",f="[object Object]",c="[object Promise]",d="[object Set]",u="[object WeakMap]",v="[object DataView]",w=s(e),x=s(n),I=s(r),S=s(t),$=s(o),m=a;return(e&&m(new e(new ArrayBuffer(1)))!=v||n&&m(new n)!=l||r&&m(r.resolve())!=c||t&&m(new t)!=d||o&&m(new o)!=u)&&(m=function(R){var P=a(R),p=P==f?R.constructor:void 0,g=p?s(p):"";if(g)switch(g){case w:return v;case x:return l;case I:return c;case S:return d;case $:return u}return P}),mr=m,mr}var vr,Ii;function $f(){if(Ii)return vr;Ii=1;var e=Object.prototype,n=e.hasOwnProperty;function r(t){var o=t.length,a=new t.constructor(o);return o&&typeof t[0]=="string"&&n.call(t,"index")&&(a.index=t.index,a.input=t.input),a}return vr=r,vr}var br,Ei;function Rf(){if(Ei)return br;Ei=1;var e=mn(),n=e.Uint8Array;return br=n,br}var hr,Pi;function so(){if(Pi)return hr;Pi=1;var e=Rf();function n(r){var t=new r.constructor(r.byteLength);return new e(t).set(new e(r)),t}return hr=n,hr}var xr,Oi;function If(){if(Oi)return xr;Oi=1;var e=so();function n(r,t){var o=t?e(r.buffer):r.buffer;return new r.constructor(o,r.byteOffset,r.byteLength)}return xr=n,xr}var _r,Ti;function Ef(){if(Ti)return _r;Ti=1;var e=/\w*$/;function n(r){var t=new r.constructor(r.source,e.exec(r));return t.lastIndex=r.lastIndex,t}return _r=n,_r}var yr,Mi;function Pf(){if(Mi)return yr;Mi=1;var e=ms(),n=e?e.prototype:void 0,r=n?n.valueOf:void 0;function t(o){return r?Object(r.call(o)):{}}return yr=t,yr}var wr,Ni;function Of(){if(Ni)return wr;Ni=1;var e=so();function n(r,t){var o=t?e(r.buffer):r.buffer;return new r.constructor(o,r.byteOffset,r.length)}return wr=n,wr}var Sr,Ai;function Tf(){if(Ai)return Sr;Ai=1;var e=so(),n=If(),r=Ef(),t=Pf(),o=Of(),a="[object Boolean]",s="[object Date]",l="[object Map]",f="[object Number]",c="[object RegExp]",d="[object Set]",u="[object String]",v="[object Symbol]",w="[object ArrayBuffer]",x="[object DataView]",I="[object Float32Array]",S="[object Float64Array]",$="[object Int8Array]",m="[object Int16Array]",R="[object Int32Array]",P="[object Uint8Array]",p="[object Uint8ClampedArray]",g="[object Uint16Array]",C="[object Uint32Array]";function b(y,O,h){var _=y.constructor;switch(O){case w:return e(y);case a:case s:return new _(+y);case x:return n(y,h);case I:case S:case $:case m:case R:case P:case p:case g:case C:return o(y,h);case l:return new _;case f:case u:return new _(y);case c:return r(y);case d:return new _;case v:return t(y)}}return Sr=b,Sr}var Cr,ki;function Mf(){if(ki)return Cr;ki=1;var e=Hr(),n=Object.create,r=function(){function t(){}return function(o){if(!e(o))return{};if(n)return n(o);t.prototype=o;var a=new t;return t.prototype=void 0,a}}();return Cr=r,Cr}var $r,ji;function Nf(){if(ji)return $r;ji=1;var e=Mf(),n=Fa(),r=to();function t(o){return typeof o.constructor=="function"&&!r(o)?e(n(o)):{}}return $r=t,$r}var Rr,zi;function Af(){if(zi)return Rr;zi=1;var e=ao(),n=Wn(),r="[object Map]";function t(o){return n(o)&&e(o)==r}return Rr=t,Rr}var Ir,Li;function kf(){if(Li)return Ir;Li=1;var e=Af(),n=eo(),r=no(),t=r&&r.isMap,o=t?n(t):e;return Ir=o,Ir}var Er,Di;function jf(){if(Di)return Er;Di=1;var e=ao(),n=Wn(),r="[object Set]";function t(o){return n(o)&&e(o)==r}return Er=t,Er}var Pr,qi;function zf(){if(qi)return Pr;qi=1;var e=jf(),n=eo(),r=no(),t=r&&r.isSet,o=t?n(t):e;return Pr=o,Pr}var Or,Ki;function Lf(){if(Ki)return Or;Ki=1;var e=Zc(),n=Jc(),r=ka(),t=ff(),o=df(),a=pf(),s=mf(),l=bf(),f=hf(),c=xf(),d=_f(),u=ao(),v=$f(),w=Tf(),x=Nf(),I=Vr(),S=ja(),$=kf(),m=Hr(),R=zf(),P=ro(),p=oo(),g=1,C=2,b=4,y="[object Arguments]",O="[object Array]",h="[object Boolean]",_="[object Date]",E="[object Error]",T="[object Function]",B="[object GeneratorFunction]",H="[object Map]",q="[object Number]",D="[object Object]",re="[object RegExp]",M="[object Set]",se="[object String]",le="[object Symbol]",N="[object WeakMap]",j="[object ArrayBuffer]",F="[object DataView]",Y="[object Float32Array]",ee="[object Float64Array]",G="[object Int8Array]",W="[object Int16Array]",fe="[object Int32Array]",de="[object Uint8Array]",Oe="[object Uint8ClampedArray]",Ie="[object Uint16Array]",X="[object Uint32Array]",z={};z[y]=z[O]=z[j]=z[F]=z[h]=z[_]=z[Y]=z[ee]=z[G]=z[W]=z[fe]=z[H]=z[q]=z[D]=z[re]=z[M]=z[se]=z[le]=z[de]=z[Oe]=z[Ie]=z[X]=!0,z[E]=z[T]=z[N]=!1;function xe(L,_e,ue,Ae,$e,he){var U,qe=_e&g,Te=_e&C,Me=_e&b;if(ue&&(U=$e?ue(L,Ae,$e,he):ue(L)),U!==void 0)return U;if(!m(L))return L;var Ye=I(L);if(Ye){if(U=v(L),!qe)return s(L,U)}else{var me=u(L),ye=me==T||me==B;if(S(L))return a(L,qe);if(me==D||me==y||ye&&!$e){if(U=Te||ye?{}:x(L),!qe)return Te?f(L,o(U,L)):l(L,t(U,L))}else{if(!z[me])return $e?L:{};U=w(L,me,qe)}}he||(he=new e);var ze=he.get(L);if(ze)return ze;he.set(L,U),R(L)?L.forEach(function(Ee){U.add(xe(Ee,_e,ue,Ee,L,he))}):$(L)&&L.forEach(function(Ee,ae){U.set(ae,xe(Ee,_e,ue,ae,L,he))});var ve=Me?Te?d:c:Te?p:P,Be=Ye?void 0:ve(L);return n(Be||L,function(Ee,ae){Be&&(ae=Ee,Ee=L[ae]),r(U,ae,xe(Ee,_e,ue,ae,L,he))}),U}return Or=xe,Or}var Tr,Bi;function Df(){if(Bi)return Tr;Bi=1;var e=Lf(),n=1,r=4;function t(o){return e(o,n|r)}return Tr=t,Tr}var qf=Df();const Fi=aa(qf);var Kf=({className:e="",...n})=>{let r=(Is(),ws(Es)).default;return Pe.createElement(Ss,{className:e,component:r,...n})},Yf=Kf,Zf=()=>{let[e,n]=i.useState(vs()),{setPaymentPassword:r,userInfo:t,modalOptions:o,showAccountTipModal:a}=sa();return i.useEffect(()=>{var s;n(!!((s=t==null?void 0:t.security_account)!=null&&s.has_set_payment_password))},[t]),{hasSetPaymentPassword:e,setPaymentPassword:r,showSetPaymentPasswordOrConfirm:s=>{var l,f,c,d;e?s():((l=o.promptSettingConfig)==null?void 0:l.promptPaymentPasswordSettingWhenSign)===2||((f=o.promptSettingConfig)==null?void 0:f.promptPaymentPasswordSettingWhenSign)===3?a({visible:!0,confirm:s}):((c=o.promptSettingConfig)!=null&&c.promptPaymentPasswordSettingWhenSign||bs((d=o.promptSettingConfig)==null?void 0:d.promptPaymentPasswordSettingWhenSign))&&!hs(fo.PN_OPEN_SET_PAYMENT_PASSWORD)?(xs(fo.PN_OPEN_SET_PAYMENT_PASSWORD,"1"),a({visible:!0,confirm:s})):s()}}},Jf=`.info-sign {
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
`,Bf=e=>{var n;let{userInfo:r}=e,t=_s(),{modalOptions:o}=sa(),a=i.useMemo(()=>{let c=`${o.appId}_${r==null?void 0:r.uuid}`;return`account_security_${ys(c)}`},[o.appId,r==null?void 0:r.uuid]),[s,l]=i.useState({account:{name:"Account & Security",display:!0,badge:!1}});i.useEffect(()=>{if(r!=null&&r.security_account&&a&&!localStorage.getItem(a)){let{has_set_master_password:c,has_set_payment_password:d}=(r==null?void 0:r.security_account)||{};!c||!d?s.account.badge=!0:s.account.badge=!1}else s.account.badge=!1;l(Fi(s))},[r==null?void 0:r.security_account,a]);let f=Pe.createElement("div",{className:"item",onClick:()=>{s.account.badge=!1,l(Fi(s)),t("/account/security"),localStorage.setItem(a,"true")}},Pe.createElement(va,{dot:!!s.account.badge},Pe.createElement(Rs,{className:"wallet-icon",name:"security_icon"})));return Pe.createElement("div",{className:"top-menu-list"},!!((n=s==null?void 0:s.account)!=null&&n.display)&&f)},Qf=Bf,jn={},Wi;function Ff(){if(Wi)return jn;Wi=1;function e(p){"@babel/helpers - typeof";return e=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(g){return typeof g}:function(g){return g&&typeof Symbol=="function"&&g.constructor===Symbol&&g!==Symbol.prototype?"symbol":typeof g},e(p)}Object.defineProperty(jn,"__esModule",{value:!0}),jn.CopyToClipboard=void 0;var n=o(Cs()),r=o(Ps()),t=["text","onCopy","options","children"];function o(p){return p&&p.__esModule?p:{default:p}}function a(p,g){var C=Object.keys(p);if(Object.getOwnPropertySymbols){var b=Object.getOwnPropertySymbols(p);g&&(b=b.filter(function(y){return Object.getOwnPropertyDescriptor(p,y).enumerable})),C.push.apply(C,b)}return C}function s(p){for(var g=1;g<arguments.length;g++){var C=arguments[g]!=null?arguments[g]:{};g%2?a(Object(C),!0).forEach(function(b){R(p,b,C[b])}):Object.getOwnPropertyDescriptors?Object.defineProperties(p,Object.getOwnPropertyDescriptors(C)):a(Object(C)).forEach(function(b){Object.defineProperty(p,b,Object.getOwnPropertyDescriptor(C,b))})}return p}function l(p,g){if(p==null)return{};var C=f(p,g),b,y;if(Object.getOwnPropertySymbols){var O=Object.getOwnPropertySymbols(p);for(y=0;y<O.length;y++)b=O[y],!(g.indexOf(b)>=0)&&Object.prototype.propertyIsEnumerable.call(p,b)&&(C[b]=p[b])}return C}function f(p,g){if(p==null)return{};var C={},b=Object.keys(p),y,O;for(O=0;O<b.length;O++)y=b[O],!(g.indexOf(y)>=0)&&(C[y]=p[y]);return C}function c(p,g){if(!(p instanceof g))throw new TypeError("Cannot call a class as a function")}function d(p,g){for(var C=0;C<g.length;C++){var b=g[C];b.enumerable=b.enumerable||!1,b.configurable=!0,"value"in b&&(b.writable=!0),Object.defineProperty(p,b.key,b)}}function u(p,g,C){return g&&d(p.prototype,g),Object.defineProperty(p,"prototype",{writable:!1}),p}function v(p,g){if(typeof g!="function"&&g!==null)throw new TypeError("Super expression must either be null or a function");p.prototype=Object.create(g&&g.prototype,{constructor:{value:p,writable:!0,configurable:!0}}),Object.defineProperty(p,"prototype",{writable:!1}),g&&w(p,g)}function w(p,g){return w=Object.setPrototypeOf||function(b,y){return b.__proto__=y,b},w(p,g)}function x(p){var g=$();return function(){var b=m(p),y;if(g){var O=m(this).constructor;y=Reflect.construct(b,arguments,O)}else y=b.apply(this,arguments);return I(this,y)}}function I(p,g){if(g&&(e(g)==="object"||typeof g=="function"))return g;if(g!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return S(p)}function S(p){if(p===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return p}function $(){if(typeof Reflect>"u"||!Reflect.construct||Reflect.construct.sham)return!1;if(typeof Proxy=="function")return!0;try{return Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){})),!0}catch{return!1}}function m(p){return m=Object.setPrototypeOf?Object.getPrototypeOf:function(C){return C.__proto__||Object.getPrototypeOf(C)},m(p)}function R(p,g,C){return g in p?Object.defineProperty(p,g,{value:C,enumerable:!0,configurable:!0,writable:!0}):p[g]=C,p}var P=function(p){v(C,p);var g=x(C);function C(){var b;c(this,C);for(var y=arguments.length,O=new Array(y),h=0;h<y;h++)O[h]=arguments[h];return b=g.call.apply(g,[this].concat(O)),R(S(b),"onClick",function(_){var E=b.props,T=E.text,B=E.onCopy,H=E.children,q=E.options,D=n.default.Children.only(H),re=(0,r.default)(T,q);B&&B(T,re),D&&D.props&&typeof D.props.onClick=="function"&&D.props.onClick(_)}),b}return u(C,[{key:"render",value:function(){var y=this.props;y.text,y.onCopy,y.options;var O=y.children,h=l(y,t),_=n.default.Children.only(O);return n.default.cloneElement(_,s(s({},h),{},{onClick:this.onClick}))}}]),C}(n.default.PureComponent);return jn.CopyToClipboard=P,R(P,"defaultProps",{onCopy:void 0,options:void 0}),jn}var Mr,Vi;function Wf(){if(Vi)return Mr;Vi=1;var e=Ff(),n=e.CopyToClipboard;return n.CopyToClipboard=n,Mr=n,Mr}var Vf=Wf();const eu=aa(Vf);export{Zf as F,eu as M,Jf as Q,Vc as T,Yf as Y,Qf as o};
