
import React from "react";
import Layout from "@/components/Layout";
import { ArrowLeft, CheckCircle2, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import CustomButton from "@/components/ui/CustomButton";

const SettingsPage = () => {
  return (
    <Layout className="pt-28 pb-16">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 flex items-center">
          <Link to="/" className="mr-4 p-2 rounded-full hover:bg-secondary/80 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>

        <div className="space-y-8">
          {/* Premium Plan */}
          <div className="glass-card p-6 rounded-xl">
            <h2 className="text-xl font-medium mb-4">Upgrade to Premium</h2>
            
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <div className="mr-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CreditCard className="text-primary" size={24} />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">Premium Plan</h3>
                  <div className="text-2xl font-bold mb-2">$49<span className="text-sm font-normal text-muted-foreground">/month</span></div>
                  <p className="text-muted-foreground mb-4">Unlock all features and get unlimited access to our HS classification system.</p>
                  
                  <ul className="space-y-2 mb-6">
                    {["Unlimited classifications", "Priority support", "Batch processing", "Export to CSV/Excel", "API access"].map((feature) => (
                      <li key={feature} className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-primary mr-2 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <CustomButton>
                    Upgrade Now
                  </CustomButton>
                </div>
              </div>
            </div>
          </div>
          
          {/* User Information */}
          <div className="glass-card p-6 rounded-xl">
            <h2 className="text-xl font-medium mb-4">Account Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  className="w-full p-3 rounded-lg border border-border bg-transparent focus:ring-2 focus:ring-primary/30 focus-visible:outline-none"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Company Name</label>
                <input
                  type="text"
                  className="w-full p-3 rounded-lg border border-border bg-transparent focus:ring-2 focus:ring-primary/30 focus-visible:outline-none"
                  placeholder="Your Company"
                />
              </div>
              <div className="flex justify-end">
                <CustomButton variant="outline" className="mr-2">
                  Cancel
                </CustomButton>
                <CustomButton>
                  Save Changes
                </CustomButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SettingsPage;
