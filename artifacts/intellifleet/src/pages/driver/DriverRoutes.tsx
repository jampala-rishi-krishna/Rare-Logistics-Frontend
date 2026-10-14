// Signed-in driver app routes (rendered by App.tsx under /driver/* behind the driver RoleGate).
// Three tabs (Today / History / Profile) + the one trip screen. Every old URL (acknowledge, route, check-out, handover,
// trip timeline, trips, alerts, issues) redirects to a live screen so bookmarks and alert links never 404.
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import { legacyRedirect } from "@/lib/tripNav";
import DriverToday from "@/pages/driver/DriverToday";
import DriverTripScreen from "@/pages/driver/DriverTripScreen";
import DriverHistory from "@/pages/driver/DriverHistory";
import DriverProfile from "@/pages/driver/DriverProfile";

function LegacyRedirect() {
  const [location] = useLocation();
  const search = useSearch();
  return <Redirect to={legacyRedirect(location, search)} replace />;
}

export default function DriverRoutes() {
  return (
    <Switch>
      <Route path="/driver/today" component={DriverToday} />
      <Route path="/driver/trip/:batch_id" component={DriverTripScreen} />
      <Route path="/driver/history" component={DriverHistory} />
      <Route path="/driver/profile" component={DriverProfile} />
      <Route component={LegacyRedirect} />
    </Switch>
  );
}
