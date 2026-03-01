import React from 'react';
import { LoginPage } from '../components/LoginPage';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/');
  };

  return <LoginPage onLogin={handleLogin} />;
}
