import{p as r}from"./chunk-GKIRU5P2-B6ZqBHrn.js";import{o as t,as as u,ap as s}from"./index-CaXbrBtJ.js";import{I as n}from"./index-D-AYJ3bw.js";var o=`.icon-eye {
  display: block;
  margin: auto;
  font-size: 23px;
}
`,p=()=>t.createElement(t.Fragment,null,t.createElement("style",null,o),t.createElement(r,{className:"icon-eye",name:"eye_open"})),d=()=>t.createElement(t.Fragment,null,t.createElement("style",null,o),t.createElement(r,{className:"icon-eye",name:"eye_close"})),c=`.password-input {
  position: relative;
  width: 100%;
  height: 47px;
  min-height: 47px;
  padding: 0;
  border: none !important;
  border-radius: var(--primary-btn-border-radius);
  overflow: hidden;
  background: none;
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
`,m=e=>{let i=t.useRef(null);return t.createElement(t.Fragment,null,t.createElement("div",{className:"password-input-0"},t.createElement(n.Password,null)),t.createElement("style",null,`
        ${c}
        .password-input .ant-input-password {
          background-image: none !important;
        }
        .password-input .ant-input-password input {
          -webkit-text-fill-color: inherit !important;
          opacity: 1 !important;
        }
      `),t.createElement(n.Password,{ref:i,className:"password-input"+(e!=null&&e.className?` ${e==null?void 0:e.className}`:""),iconRender:a=>a?t.createElement("div",null,t.createElement(p,null)):t.createElement("div",null,t.createElement(d,null)),onChange:a=>{var l;e!=null&&e.onChange&&((l=e==null?void 0:e.onChange)==null||l.call(e,a.target.value))},defaultValue:e==null?void 0:e.defaultValue,maxLength:(e==null?void 0:e.maxLength)||20,onPressEnter:a=>{var l;return(l=e==null?void 0:e.onPressEnter)==null?void 0:l.call(e,a)},onBlur:a=>{var l;return(l=e==null?void 0:e.onBlur)==null?void 0:l.call(e,a)},autoFocus:u(e==null?void 0:e.autoFocus)&&s()?!0:e==null?void 0:e.autoFocus}))},w=m;export{w as B};
