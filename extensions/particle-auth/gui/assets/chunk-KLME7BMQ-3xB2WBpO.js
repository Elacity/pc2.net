import{d as o}from"./chunk-YNAB6HVU-C20GHWyO.js";import{a4 as t,a5 as n,bi as s,b3 as d}from"./index-CJ2_VouK.js";import{I as r}from"./index-UpDf5Fgr.js";var i=`.icon-eye {
  display: block;
  margin: auto;
  font-size: 23px;
}
`,p=()=>t.createElement(t.Fragment,null,t.createElement("style",null,n(i)),t.createElement(o,{className:"icon-eye",name:"eye_open"})),c=()=>t.createElement(t.Fragment,null,t.createElement("style",null,n(i)),t.createElement(o,{className:"icon-eye",name:"eye_close"})),m=`.password-input {
  position: relative;
  width: 100%;
  height: 45px;
  min-height: 45px;
  padding: 0;
  border: none !important;
  overflow: hidden;
  background: none !important;
}
.password-input.ant-input-outlined {
  box-shadow: none;
}
.password-input input {
  width: 100%;
  height: 45px;
  padding: 0 8px;
  padding-left: 16px !important;
  font-weight: 500;
  font-size: 15px;
  color: var(--text-color);
  background-color: var(--input-background-color);
  border-radius: var(--primary-btn-border-radius);
}
.password-input .ant-input-suffix {
  position: absolute;
  z-index: 1;
  top: 12px;
  right: 14px;
  cursor: pointer;
}
.password-input-0 {
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
}
.password-input .ant-input-password {
  background-image: none !important;
}
.password-input .ant-input-password input {
  -webkit-text-fill-color: inherit !important;
  opacity: 1 !important;
}
`,v=e=>{let u=t.useRef(null);return t.createElement(t.Fragment,null,t.createElement("div",{className:"password-input-0"},t.createElement(r.Password,null)),t.createElement("style",null,n(m)),t.createElement(r.Password,{ref:u,className:"password-input"+(e!=null&&e.className?` ${e==null?void 0:e.className}`:""),iconRender:l=>l?t.createElement("div",null,t.createElement(p,null)):t.createElement("div",null,t.createElement(c,null)),onChange:l=>{var a;e!=null&&e.onChange&&((a=e==null?void 0:e.onChange)==null||a.call(e,l.target.value))},defaultValue:e==null?void 0:e.defaultValue,maxLength:(e==null?void 0:e.maxLength)||20,onPressEnter:l=>{var a;return(a=e==null?void 0:e.onPressEnter)==null?void 0:a.call(e,l)},onBlur:l=>{var a;return(a=e==null?void 0:e.onBlur)==null?void 0:a.call(e,l)},autoFocus:s(e==null?void 0:e.autoFocus)&&d()?!0:e==null?void 0:e.autoFocus}))},x=v;export{x as B};
