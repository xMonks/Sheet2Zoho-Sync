import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User, ArrowRight, Database, FileSpreadsheet, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'empty') {
      onLogin();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-slate-50">
      {/* Left Column - Image & Content */}
      <div className="relative hidden md:flex flex-col justify-center p-12 overflow-hidden bg-blue-900">
        <div className="absolute inset-0">
          <img 
            src="https://picsum.photos/seed/crm/1920/1080?blur=2" 
            alt="CRM Dashboard" 
            className="w-full h-full object-cover opacity-40 mix-blend-overlay"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-blue-950/90 to-blue-900/40" />
        </div>
        
        <div className="relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-sm border border-blue-400/30">
              <Database className="w-8 h-8 text-blue-100" />
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
              Streamline Your Lead Syncing Process
            </h1>
            <p className="text-blue-100/80 text-lg mb-8 leading-relaxed">
              Connect Google Sheets directly to Zoho CRM. Map your fields, preview your data, and sync leads seamlessly with our powerful integration tool.
            </p>
            
            <div className="flex items-center gap-4 text-sm font-medium text-blue-200">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-blue-400 border-2 border-blue-900 flex items-center justify-center"><FileSpreadsheet className="w-4 h-4 text-white" /></div>
                <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-blue-900 flex items-center justify-center"><ArrowRight className="w-4 h-4 text-white" /></div>
                <div className="w-8 h-8 rounded-full bg-blue-600 border-2 border-blue-900 flex items-center justify-center"><Database className="w-4 h-4 text-white" /></div>
              </div>
              <span>Google Sheets to Zoho CRM</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Column - Login Panel */}
      <div className="flex items-center justify-center p-8 sm:p-12">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h2>
            <p className="text-slate-500">Please sign in to access the sync dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Sign In
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
