import { Component } from 'react';
import ErrorState from './ErrorState';

/**
 * ErrorBoundary — catches render errors in child components and displays
 * a fallback UI instead of unmounting the entire React tree (blank white page).
 *
 * Usage:
 *   <ErrorBoundary>
 *     <Routes>...</Routes>
 *   </ErrorBoundary>
 *
 * Without this, any runtime error in any component causes React 18 to
 * unmount the entire component tree with no fallback.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging (can be extended to send to error reporting service)
    console.error('[ErrorBoundary] Caught rendering error:', error);
    if (errorInfo && errorInfo.componentStack) {
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided via props, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI using existing ErrorState component
      return (
        <div className="min-h-screen flex items-center justify-center bg-netflix-dark px-4">
          <ErrorState
            message={
              process.env.NODE_ENV === 'development'
                ? this.state.error?.message || 'Something went wrong'
                : 'Something went wrong. Please try refreshing the page.'
            }
            onRetry={this.handleRetry}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
