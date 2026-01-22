import{C as _}from"./chunk-PHADJY2T-L0wq_ROw.js";import{d as w}from"./chunk-YNAB6HVU-BA-TibPS.js";import{p as k}from"./chunk-TT34D6R6-B6RO9i8A.js";import{cc as E,r as h,ce as N,cf as $,cg as O,$ as T,aw as j,Y as A,an as S,a4 as l,a5 as z,ar as C,aa as B,a0 as s,a9 as I,ak as M,al as P,ai as F}from"./index-CRQsZryZ.js";import{N as L}from"./throttle-Bje8fjUc.js";function R(c,e){var o,r=E(c),u=(o=e==null?void 0:e.wait)!==null&&o!==void 0?o:1e3,t=h.useMemo(function(){return L(function(){for(var i=[],n=0;n<arguments.length;n++)i[n]=arguments[n];return r.current.apply(r,N([],$(i),!1))},u,e)},[]);return O(function(){t.cancel()}),{run:t,cancel:t.cancel,flush:t.flush}}var U=`.login-account-box {
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
`,b=c=>{let{userInfo:e,t:o}=c;return[{type:s.phone,icon:B,name:o("account.mobile"),value:e.phone,id:void 0,isOriginal:!1},{type:s.email,icon:I,name:o("account.email"),value:e.email,id:void 0,isOriginal:!1},{type:s.google,icon:M,name:o("login.google"),value:e.google_email,id:e.google_id,isOriginal:!1},{type:s.facebook,icon:P,name:o("login.facebook"),value:e.facebook_email,id:e.facebook_id,isOriginal:!1},{type:s.twitter,icon:F,name:o("login.twitter"),value:e.twitter_email,id:e.twitter_id,isOriginal:!1}]},y=c=>{var e,o,r,u;let t=c==null?void 0:c.replace(" ","");if(t)if((e=t==null?void 0:t.includes)!=null&&e.call(t,"@"))t=`${t.split("@")[0].substr(0,3)}****@${t.split("@")[1]}`;else if((o=t==null?void 0:t.includes)!=null&&o.call(t,"+")){let i=C(t),n=i.nationalNumber.toString();t=`+${i.countryCallingCode} ${(r=n==null?void 0:n.substr)==null?void 0:r.call(n,0,3)}****${(u=n==null?void 0:n.substr)==null?void 0:u.call(n,-4)}`}else t&&(t=`${t.substr(0,3)}****${t.substr(-4)}`);else return t;return t},d,V=()=>{let{t:c}=T(),e=j(),{userInfo:o,showSelectSecurityAccount:r}=A(),u=S(),{run:t}=R(a=>{e("/account/verify",{state:{account:a.account,authType:d,pageType:"verify_security_account_bind_login_account"}})},{wait:3e3}),i=h.useMemo(()=>b({userInfo:o,t:c}),[o,c]),n=a=>{var g,m,p,v,f,x;a.value||a.id?e("/login-account/bind",{state:{authType:a.type}}):!((g=o==null?void 0:o.security_account)!=null&&g.email)&&!((m=o==null?void 0:o.security_account)!=null&&m.phone)?u.error("Please bind security account first."):(p=o==null?void 0:o.security_account)!=null&&p.email&&((v=o==null?void 0:o.security_account)!=null&&v.phone)?r(!0,{authType:d,pageType:"verify_security_account_bind_login_account"}):t({account:((f=o==null?void 0:o.security_account)==null?void 0:f.email)||((x=o==null?void 0:o.security_account)==null?void 0:x.phone)})};return l.createElement("div",{className:"login-account-box"},l.createElement("style",null,z(U)),l.createElement(_,{displayBackBtn:!0},c("account.login_account")),l.createElement("div",{className:"scroll-content"},l.createElement("div",{className:"login-account-description"},c("account.login_account_hint")),l.createElement("div",{className:"account-list"},i==null?void 0:i.map((a,g)=>l.createElement("div",{className:"login-account-item",onClick:()=>{d=a.type,n(a)},key:g},l.createElement("img",{src:a.icon}),l.createElement("div",{className:"login-account-name"},a.name),l.createElement("div",{className:"login-account-value","data-no-linked":!(a.value||a.id)},y(a.value||a.id)||c("account.not_linked")),l.createElement(w,{className:"arrow-right-icon",name:"arrow_right_icon"}))))),l.createElement(k,{className:"footer-box-v2"}))},W=V;const q=Object.freeze(Object.defineProperty({__proto__:null,default:W,encryptValue:y,getAccountList:b},Symbol.toStringTag,{value:"Module"}));export{y as F,b as j,q as l,R as u};
