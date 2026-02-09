'use client';

import React, { ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      const errorMessage = this.state.error.message || 'An unknown error occurred';
      const truncatedMessage = errorMessage.length > 150
        ? errorMessage.substring(0, 150) + '...'
        : errorMessage;

      return (
        <div className="flex items-center justify-center min-h-screen bg-card border border-border rounded-lg p-8">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center space-y-6">
              {/* Error Icon */}
              <div className="relative w-16 h-16">
                <svg
                  className="w-full h-full text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v2m0 4v2m0-12a9 9 0 110 18 9 9 0 010-18z"
                  />
                </svg>
              </div>

              {/* Error Message */}
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-foreground">
                  Something went wrong
                </h2>
                <p className="text-sm text-foreground/70">
                  {truncatedMessage}
                </p>
              </div>

              {/* Try Again Button */}
              <button
                onClick={this.resetError}
                className="w-full px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200"
                style={{
                  backgroundColor: '#6366f1',
                  borderColor: '#6366f1',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Try Again
              </button>

              {/* Additional Info in Development */}
              {process.env.NODE_ENV === 'development' && (
                <div className="w-full mt-6 p-4 bg-black/20 border border-border rounded text-xs text-foreground/60 font-mono overflow-auto max-h-32">
                  <p className="font-semibold text-red-400 mb-2">Error Details:</p>
                  <p>{errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
