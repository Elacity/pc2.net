import{w as _}from"./chunk-SL2KVVUD-D0vEhO6V.js";import{p as w}from"./chunk-GKIRU5P2-B6ZqBHrn.js";import{N as k}from"./chunk-CHA6AH7V-Bh_Ms4Al.js";import{a$ as E,r as b,b1 as N,b2 as $,b3 as T,W as O,Z as j,V as A,x as z,o as l,D as S,j as C,A as s,h as F,F as M,v as B,n as I}from"./index-CaXbrBtJ.js";import{N as P}from"./throttle-CnyNgHA9.js";function W(c,e){var o,r=E(c),u=(o=e==null?void 0:e.wait)!==null&&o!==void 0?o:1e3,t=b.useMemo(function(){return P(function(){for(var i=[],a=0;a<arguments.length;a++)i[a]=arguments[a];return r.current.apply(r,N([],$(i),!1))},u,e)},[]);return T(function(){t.cancel()}),{run:t,cancel:t.cancel,flush:t.flush}}var L=`.login-account-box {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
  height: 100%;
  overflow: auto;
  color: var(--text-color);
}
.login-account-box .login-account-title {
  font-weight: 500;
  font-size: 18px;
}
.login-account-box .login-account-description {
  margin: 32px 18px 40px;
  font-weight: 400;
  font-size: 13px;
  color: var(--secondary-text-color);
}
.login-account-box .account-list {
  width: 100%;
  padding: 0 18px;
}
.login-account-box .account-list .login-account-item {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
  height: 60px;
  padding: 0 12px 0 14px;
  margin-bottom: 10px;
  border-radius: var(--card-border-radius);
  background: var(--card-unclickable-background-color);
  cursor: pointer;
}
.login-account-box .account-list .login-account-item img {
  width: 35px;
  height: 35px;
  border-radius: 50%;
  background-color: white;
}
.login-account-box .account-list .login-account-item .login-account-name {
  flex-grow: 1;
  margin-left: 8px;
  font-weight: 500;
  font-size: 14px;
}
.login-account-box .account-list .login-account-item .login-account-value {
  flex-grow: 2;
  max-width: 180px;
  margin-right: 8px;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}
.login-account-box .account-list .login-account-item .login-account-value[data-no-linked='true'] {
  color: var(--secondary-text-color);
}
.login-account-box .account-list .login-account-item:hover {
  opacity: var(--hover-opacity);
}
.login-account-box .account-list .arrow-right-icon {
  color: var(--text-color);
}
.login-account-box .account-list .arrow-right-icon svg {
  width: 12px;
  height: 12px;
}
.login-account-box .footer-box {
  position: absolute;
  bottom: 0;
}
`,h=c=>{let{userInfo:e,t:o}=c;return[{type:s.phone,icon:C,name:o("account.mobile"),value:e.phone,id:void 0,isOriginal:!1},{type:s.email,icon:F,name:o("account.email"),value:e.email,id:void 0,isOriginal:!1},{type:s.google,icon:M,name:o("login.google"),value:e.google_email,id:e.google_id,isOriginal:!1},{type:s.facebook,icon:B,name:o("login.facebook"),value:e.facebook_email,id:e.facebook_id,isOriginal:!1},{type:s.twitter,icon:I,name:o("login.twitter"),value:e.twitter_email,id:e.twitter_id,isOriginal:!1}]},y=c=>{var e,o,r,u;let t=c==null?void 0:c.replace(" ","");if(t)if((e=t==null?void 0:t.includes)!=null&&e.call(t,"@"))t=`${t.split("@")[0].substr(0,3)}****@${t.split("@")[1]}`;else if((o=t==null?void 0:t.includes)!=null&&o.call(t,"+")){let i=S(t),a=i.nationalNumber.toString();t=`+${i.countryCallingCode} ${(r=a==null?void 0:a.substr)==null?void 0:r.call(a,0,3)}****${(u=a==null?void 0:a.substr)==null?void 0:u.call(a,-4)}`}else t&&(t=`${t.substr(0,3)}****${t.substr(-4)}`);else return t;return t},d,R=()=>{let{t:c}=O(),e=j(),{userInfo:o,showSelectSecurityAccount:r}=A(),u=z(),{run:t}=W(n=>{e("/account/verify",{state:{account:n.account,authType:d,pageType:"verify_security_account_bind_login_account"}})},{wait:3e3}),i=b.useMemo(()=>h({userInfo:o,t:c}),[o,c]),a=n=>{var g,m,v,p,f,x;n.value||n.id?e("/login-account/bind",{state:{authType:n.type}}):!((g=o==null?void 0:o.security_account)!=null&&g.email)&&!((m=o==null?void 0:o.security_account)!=null&&m.phone)?u.error("Please bind security account first."):(v=o==null?void 0:o.security_account)!=null&&v.email&&((p=o==null?void 0:o.security_account)!=null&&p.phone)?r(!0,{authType:d,pageType:"verify_security_account_bind_login_account"}):t({account:((f=o==null?void 0:o.security_account)==null?void 0:f.email)||((x=o==null?void 0:o.security_account)==null?void 0:x.phone)})};return l.createElement("div",{className:"login-account-box"},l.createElement("style",null,L),l.createElement(_,{displayBackBtn:!0},c("account.login_account")),l.createElement("div",{className:"scroll-content"},l.createElement("div",{className:"login-account-description"},c("account.login_account_hint")),l.createElement("div",{className:"account-list"},i==null?void 0:i.map((n,g)=>l.createElement("div",{className:"login-account-item",onClick:()=>{d=n.type,a(n)},key:g},l.createElement("img",{src:n.icon}),l.createElement("div",{className:"login-account-name"},n.name),l.createElement("div",{className:"login-account-value","data-no-linked":!(n.value||n.id)},y(n.value||n.id)||c("account.not_linked")),l.createElement(w,{className:"arrow-right-icon",name:"arrow_right_icon"}))))),l.createElement(k,{className:"footer-box-v2"}))},U=R;const Q=Object.freeze(Object.defineProperty({__proto__:null,default:U,encryptValue:y,getAccountList:h},Symbol.toStringTag,{value:"Module"}));export{y as j,Q as l,W as u,h as z};
