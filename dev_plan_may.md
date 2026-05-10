1. Acquisition, Onboarding & Funnel Analytics
Incremental Signup Saving: Implement real-time local saving of signup progress so users can resume if they quit mid-process.
Onboarding Drop-off Tracking: Provide admins with an overview of exactly where users quit the signup flow to optimize the funnel.
Funnel Conversion Metrics:
Install → Signup Started Rate.
Signup Started → KYC Submitted Rate.
KYC Approved → First Redemption Rate.
Platform Tracking: Breakdown of daily downloads by iOS and Android.
2. KYC & Identity Management
CNIC Entry Migration: Remove the CNIC input field from the student-facing app. The Admin will now manually enter the 13-digit CNIC after verifying the uploaded NIC images.
Educational Grade Field: Add a mandatory field during the KYC start for "User Grade" (e.g., A-Levels, specific grades, or undergrad year).
Document UI Clarity: Update the UI to clearly state that the student must provide either an NIC OR a Secondary Document (not both).
Flexible Secondary Docs: Update logic to accept various secondary documents beyond just a "Challan."
KYC Approval Performance: Track the median days from KYC approval to a student's first redemption.
3. KYC Rejection Analytics & Audit Logs
Rejection Reason Visibility: Show the specific rejection reason directly within the "Rejected List" on the Admin Dashboard.
Rejection Stat Grouping: Group stats by student types and specific rejection reasons.
Top Issue Identification: Implement a "Most Found Issue" metric to highlight the primary reason for KYC failures.
Advanced Audit Logs: Modify the audit logs to show "Accept" and "Reject" actions as separate, filterable categories.
4. User Activity & University Segmentation
University Percentage Contribution: Calculate and display university contribution as (Total from specific Uni / Total Users)∗100.
Enhanced University Histogram: Implement a dropdown menu for the university histogram to allow for granular data viewing.
Active User Tracking: Monitor user activity breakdown for the last 7 days and 30 days.
Comprehensive Student Grouping: Enable data grouping by city, institution, and other custom segments.
5. Redemption & Behavioral Engine
Unique Redeemers Stat: Track the total number of unique users who have performed at least one redemption.
Redemption Volume Trends: Break down total redemptions by Daily, Weekly, and Monthly views.
User Behavior Histograms: Track how many users have done 1, 2, 3, or 4+ redemptions.
Repeat Rate Monitoring: Calculate the percentage of users who redeem again within 7, 30, and 90 days.
5th Bonus Tracking: Monitor the count and conversion impact of 5th-redemption bonus trigger events.
6. Brand Partner & Portfolio Health
Brand Performance Trends: Track redemptions per brand per week with a rolling 4-week trend.
Unique Redeemers per Brand: Measure individual brand reach by tracking unique users per partner.
Portfolio Metrics:
Brand Concentration Index: Share of total redemptions held by top partners.
Dry Partner Flags: Automated alerts for partners with zero or low recent activity.
Competitor Benchmarking: Implement a system to benchmark Parchi redemption rates against scraped stats from competitors like Gootlootlo.
7. UI/UX & Communication
Leaderboard PFP: Display student profile pictures directly on the city-wide leaderboard.
Parchi ID Relabeling: Remove the "PK-" prefix from user cards and relabel the field clearly as "Parchi ID."
Selective Notifications: Implement an admin tool to send targeted push notifications to a specific institution or user group.
Standard Dashboard Filters: Enable global filtering by Date Range, City, Institution, Platform, Category, and Cohort.
Signup process: 
Remove cnic ,no picture of cnic on signup 

Use student id Institute select and Student id on admin dashboard 
Mke admins manually enter student id and institute on KYC

Yes I am a student checkbox
Agree to the terms and conditions box in last signup
content:
setup Benefits of doubt No second account Complete liability on the user 
Blacklist from parchi ecosystem if trying to register multiple times
