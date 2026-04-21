import { Input, InputProps, InputRef } from 'antd';
import React from 'react';

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const GlobalInput = React.forwardRef<InputRef, InputProps>((props, ref) => {
  return <Input ref={ref} autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
});

export const GlobalInputPassword: React.FC<InputProps> = (props) => {
  return <Input.Password autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};

export const GlobalTextArea: React.FC<TextAreaProps> = (props) => {
  return <Input.TextArea autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};

export const GlobalSearch: React.FC<InputProps> = (props) => {
  return <Input.Search autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};
