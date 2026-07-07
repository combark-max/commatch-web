import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline';
  size?: 'md' | 'lg';
  children: React.ReactNode;
}

const Button = ({ variant = 'primary', size = 'md', children, className = '', ...props }: ButtonProps) => {
  const baseStyles = "rounded-full font-semibold transition-all inline-flex items-center justify-center";

  const variantStyles = {
    primary: "bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-200",
    outline: "bg-white text-green-600 border-2 border-green-600 hover:bg-green-50"
  };

  const sizeStyles = {
    md: "px-5 py-2 text-base",
    lg: "px-8 py-4 text-lg"
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
