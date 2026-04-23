import { Metadata } from "next";

import { cn } from "@/lib/utils";

const metadataInfo = {
  title: "Terms of Service – Arbitrum",
  description:
    "Read the official Arbitrum Governance Platform Terms. This document governs your use of the Arbitrum governance platform and related services.",
};

export const metadata: Metadata = {
  ...metadataInfo,
};

export default function TermsOfServicePage() {
  return (
    <div
      className={cn(
        "tos-content pt-22 m-auto px-4 pb-30",
        "[&_a]:underline",
        "[&_li]:my-2 [&_ol]:list-decimal [&_ol]:pl-10",
        "[&_ul]:list-disc [&_ul]:pl-10",
        "font-normal lg:max-w-[720px] lg:pb-36 lg:pt-40"
      )}
    >
      <p className="mb-6">
        <strong>Date of Last Revision</strong>
        <span className="opacity-80">: April 20, 2026</span>
      </p>
      <h1 className="mb-16 text-3xl leading-extra-tight lg:text-4xl">
        ARBITRUM GOVERNANCE PLATFORM TERMS
      </h1>
      <ol className="space-y-6 pl-10">
        <li className="opacity-80">
          <span className="font-semibold">
            Acceptance of These Arbitrum Governance Platform Terms
          </span>
          <p className="mt-2 opacity-80">
            Please read these Arbitrum Governance Platform Terms (the{" "}
            <strong>&ldquo;Governance Platform Terms&rdquo;</strong>) and
            carefully because they govern your use of the website located at{" "}
            <a
              href="https://alt.gov.arbitrum.foundation"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://alt.gov.arbitrum.foundation
            </a>{" "}
            (the <strong>&ldquo;Site&rdquo;</strong>) and services accessible
            via the Site offered by The Arbitrum Foundation (
            <strong>&ldquo;Arbitrum Foundation,&rdquo;</strong>{" "}
            <strong>&ldquo;we,&rdquo;</strong>{" "}
            <strong>&ldquo;us,&rdquo;</strong> or{" "}
            <strong>&ldquo;our&rdquo;</strong>). To make these Governance
            Platform Terms easier to read, the Site and our services are
            collectively called the <strong>&ldquo;Platform&rdquo;</strong>.
          </p>
          <p className="mt-2 opacity-80">
            The Platform provides access to a user interface through which
            decentralized autonomous organizations (
            <strong>&ldquo;DAOs&rdquo;</strong>) and their members may conduct
            and participate in certain on-chain governances functionalities. By
            accessing, browsing, or otherwise using the Site or any other aspect
            of the Platform, you acknowledge that you have read, understood, and
            agree to be bound by these Governance Platform Terms. If you are
            using the Platform on behalf of an entity or other organization, you
            are agreeing to these Governance Platform Terms for that entity or
            organization and representing to the Arbitrum Foundation that you
            have the authority to bind that entity or organization to these
            Governance Platform Terms (and, in which case, the terms
            &ldquo;you&rdquo; and &ldquo;your&rdquo; will refer to that entity
            or organization). If you do not accept the terms and conditions of
            these Governance Platform Terms, you will not access, browse or
            otherwise use the Platform.
          </p>
          <p className="mt-2 opacity-80">
            We reserve the right, at our sole discretion, to change or modify
            portions of these Governance Platform Terms at any time. If we do
            this, we will post the changes on this page and will indicate at the
            top of this page the date these Governance Platform Terms were last
            revised. You may read a current, effective copy of these Governance
            Platform Terms by visiting the &ldquo;Governance Platform
            Terms&rdquo; link on the Site. Your continued use of the Platform
            after the date any such changes become effective constitutes your
            acceptance of the new Governance Platform Terms. You should
            periodically visit this page to review the current Governance
            Platform Terms so you are aware of any revisions. If you do not
            agree to abide by these or any future Governance Platform Terms, you
            will not access, browse, or use (or continue to access, browse, or
            use) the Platform.
          </p>
          <p className="mt-2 font-semibold opacity-80">
            NOTICE ON PROHIBITED USE &ndash; RESTRICTED PERSONS: THE SERVICES
            ARE NOT OFFERED TO AND MAY NOT BE USED BY: PERSONS OR ENTITIES WHO
            RESIDE IN, ARE CITIZENS OF, ARE LOCATED IN, ARE INCORPORATED IN, OR
            HAVE A REGISTERED OFFICE IN ANY RESTRICTED TERRITORY, AS DEFINED
            BELOW (EACH SUCH PERSON OR ENTITY FROM A RESTRICTED TERRITORY, A
            &ldquo;RESTRICTED PERSON&rdquo;). WE DO NOT MAKE EXCEPTIONS.
            THEREFORE, IF YOU ARE A RESTRICTED PERSON, DO NOT ATTEMPT TO USE THE
            SERVICES. USE OF A VIRTUAL PRIVATE NETWORK (&ldquo;VPN&rdquo;) OR
            ANY OTHER SIMILAR MEANS INTENDED TO CIRCUMVENT THE RESTRICTIONS SET
            FORTH HEREIN IS PROHIBITED.
          </p>
          <p className="mt-2 font-semibold opacity-80">
            PLEASE READ THESE GOVERNANCE PLATFORM TERMS CAREFULLY, AS THEY
            CONTAIN AN AGREEMENT TO ARBITRATE AND OTHER IMPORTANT INFORMATION
            REGARDING YOUR LEGAL RIGHTS, REMEDIES, AND OBLIGATIONS. THE
            AGREEMENT TO ARBITRATE REQUIRES (WITH LIMITED EXCEPTION) THAT YOU
            SUBMIT CLAIMS YOU HAVE AGAINST US TO BINDING AND FINAL ARBITRATION,
            AND FURTHER (1) YOU WILL ONLY BE PERMITTED TO PURSUE CLAIMS AGAINST
            THE ARBITRUM FOUNDATION ON AN INDIVIDUAL BASIS, NOT AS A PLAINTIFF
            OR CLASS MEMBER IN ANY CLASS OR REPRESENTATIVE ACTION OR PROCEEDING,
            (2) YOU WILL ONLY BE PERMITTED TO SEEK RELIEF (INCLUDING MONETARY,
            INJUNCTIVE, AND DECLARATORY RELIEF) ON AN INDIVIDUAL BASIS, AND (3)
            YOU MAY NOT BE ABLE TO HAVE ANY CLAIMS YOU HAVE AGAINST US RESOLVED
            BY A JURY OR IN A COURT OF LAW.
          </p>
          <p className="mt-2 opacity-80">
            <span className="font-semibold">Your Privacy:</span> For more
            information regarding our collection, use and disclosure of personal
            data and certain other data, please see our Privacy Policy, located
            at{" "}
            <a href="/privacy">
              the <strong>&ldquo;Privacy Policy&rdquo;</strong>
            </a>
            . By using the Platform, you consent to our collection, use and
            disclosure of Personal Data and other data as outlined therein.
          </p>
          <p className="mt-2 opacity-80">
            <span className="font-semibold">Additional Terms:</span> In
            addition, when using certain features through the Platform, you will
            be subject to any additional terms applicable to such features that
            may be posted on or within the Platform from time to time. All such
            terms are hereby incorporated by reference into these Governance
            Platform Terms.
          </p>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Who Can Use the Platform.</span>
          <ol className="mt-2 space-y-2 pl-8">
            <li className="opacity-80">
              <span className="font-semibold">Eligibility.</span> You may use
              the Platform only if you are at least 18 years old, capable of
              forming a binding contract with the Arbitrum Foundation, and not
              otherwise barred from using the Platform under applicable law.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Compliance.</span> The Platform is
              only available to users in certain jurisdictions who can use the
              Platform as permitted under applicable law. You certify that you
              will comply with all applicable laws (e.g., local, state, federal
              and other laws) when using the Platform. Without limiting the
              foregoing, by using the Platform, you represent and warrant that:
              (i) you are not located in a country that is subject to a U.S.
              Government embargo; and (ii) you are not listed on any U.S.
              Government list of prohibited, sanctioned, or restricted parties.
              If you access or use the Platform outside the United States, you
              are solely responsible for ensuring that your access and use of
              the Platform in such country, territory, or jurisdiction does not
              violate any applicable laws. You must not use any software or
              networking techniques, including use of a VPN to modify your
              internet protocol address or otherwise circumvent or attempt to
              circumvent this prohibition. We reserve the right, but have no
              obligation, to monitor the locations from which our Platform is
              accessed. Furthermore, we reserve the right, at any time, in our
              sole discretion, to block access to the Platform, in whole or in
              part, from any geographic location, IP addresses, and unique
              device identifiers, or to any user who we believe is in breach of
              these Governance Platform Terms. In order to protect the integrity
              of the Platform, we reserve the right, at any time, in our sole
              discretion, to block access to the Platform from certain IP
              addresses and unique device identifiers. For the purposes of the
              Governance Platform Terms,{" "}
              <strong>&ldquo;Restricted Territory&rdquo;</strong> means the
              countries and jurisdictions in which the United States embargoes
              goods or imposes similar sanctions.
            </li>
          </ol>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">About the Platform.</span>
          <ol className="mt-2 space-y-2 pl-8">
            <li className="opacity-80">
              <span className="font-semibold">
                Description of the Platform.
              </span>{" "}
              The Platform is a web-hosted platform which provides an interface
              through which DAOs and other community member may conduct onchain
              governance activities, including but not limited to, (i) upload
              new proposals to be voted in by the DAO; (ii) vote on proposals
              and security council elections; (iii) view information regarding
              proposals, including the description and related voting records;
              (iv) view information regarding delegates and security council
              member profiles; (v) view information regarding on-chain actions
              of governance contracts; and (vi) delegate votes and tokens.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Digital Wallet.</span> In order to
              use the Platform to interact with or conduct any DAO activities,
              you must link your digital wallet(s) on supported bridge
              extensions, which allows you to purchase, store, and engage in
              transactions using supported digital assets. The Arbitrum
              Foundation does not buy, sell, or take custody or possession of
              any digital assets, nor does it act as an agent or custodian for
              any user of the Platform.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">
                Access and Use Restrictions.
              </span>{" "}
              You represent that your access and use of the Platform will fully
              comply with all applicable laws and regulations, and that you will
              not access or use the Platform to conduct, promote, or otherwise
              facilitate any illegal activity. You will comply with all
              applicable sanctions laws, regulations and rules, including but
              not limited to, those administered by the U.S. Department of the
              Treasury&rsquo;s Office of Foreign Assets Control (
              <strong>&ldquo;OFAC&rdquo;</strong>), and any other applicable
              jurisdictions; including the Crimea region of Ukraine, Cuba, Iran,
              North Korea, or Syria. The Platform may also not be used by or for
              (i) the specific benefit of any individual or entity on the
              Specially Designated Nationals and Blocked Persons (
              <strong>&ldquo;SDN&rdquo;</strong>) List maintained by OFAC; (ii)
              any entity 50% or more owned in the aggregate by any such SDN(s);
              or (iii) any other use requiring a license or other governmental
              approval. If the Arbitrum Foundation determines that you have
              breached your obligation under this section, we shall block your
              access to the Platform and any interests in property as required
              by law, if continued Platform could result in the Arbitrum
              Foundation being in violation, or subject to negative
              consequences, under applicable law.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Suspension or Termination.</span>{" "}
              We may suspend or terminate your access to the Platform at any
              time in connection with any transaction as required by applicable
              law, any governmental authority, or if we, in our sole and
              reasonable discretion, determine you are violating these
              Governance Platform Terms or the terms of any third-party service
              provider. Such suspension or termination shall not constitute a
              breach of these Governance Platform Terms by the Arbitrum
              Foundation. In accordance with its anti-money laundering,
              anti-terrorism, anti-fraud, and other compliance policies and
              practices, the Arbitrum Foundation may impose reasonable
              limitations and controls on the ability of you or any beneficiary
              to utilize the Platform. Such limitations may include, where good
              cause exists, rejecting transaction requests, freezing funds, or
              otherwise restricting you from using the Platform.
            </li>
          </ol>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Conditions of Access and Use.</span>{" "}
          The following are examples of the or uses that are illegal or
          prohibited by the Arbitrum Foundation. The Arbitrum Foundation
          reserves the right to investigate and take appropriate legal action
          against anyone who, in the Arbitrum Foundations&rsquo; sole
          discretion, violates this provision, including reporting the violator
          to law enforcement authorities. You agree not to do any of the
          following:
          <ol className="mt-2 space-y-2 pl-8">
            <li className="opacity-80">
              use, display, mirror or frame the Platform or any individual
              element within the Platform, the Arbitrum Foundations&rsquo; name,
              any the Arbitrum Foundations&rsquo; trademark, logo or other
              proprietary information, or the layout and design of any page or
              form contained on a page, without the Arbitrum Foundations&rsquo;
              express written consent;
            </li>
            <li className="opacity-80">
              access, tamper with, or use non-public areas of the Platform, the
              Arbitrum Foundations&rsquo; computer systems, or the technical
              delivery systems of the Arbitrum Foundations&rsquo; providers;
            </li>
            <li className="opacity-80">
              attempt to probe, scan or test the vulnerability of any the
              Arbitrum Foundation system or network or breach any security or
              authentication measures;
            </li>
            <li className="opacity-80">
              avoid, bypass, remove, deactivate, impair, descramble or otherwise
              circumvent any technological measure implemented by The Arbitrum
              Foundation or any of The Arbitrum Foundations&rsquo; providers or
              any other third party (including another user) to protect the
              Platform;
            </li>
            <li className="opacity-80">
              attempt to access or search the Platform or download content from
              the Platform using any engine, software, tool, agent, device or
              mechanism (including spiders, robots, crawlers, data mining tools
              or the like) other than the software and/or search agents provided
              by the Arbitrum Foundation or other generally available
              third-party web browsers;
            </li>
            <li className="opacity-80">
              use any meta tags or other hidden text or metadata utilizing an
              the Arbitrum Foundation trademark, logo URL or product name
              without the Arbitrum Foundations&rsquo; express written consent;
            </li>
            <li className="opacity-80">
              forge any TCP/IP packet header or any part of the header
              information in any email or newsgroup posting, or in any way use
              the Platform to send altered, deceptive or false
              source-identifying information;
            </li>
            <li className="opacity-80">
              attempt to decipher, decompile, disassemble or reverse engineer
              any of the software used to provide the Platform;
            </li>
            <li className="opacity-80">
              seek to interfere with or compromise the integrity, security, or
              proper functioning of any computer, server, network, personal
              device, or other information technology system, including the
              deployment of viruses and denial of service attacks;
            </li>
            <li className="opacity-80">
              violate any applicable local, state, national, or international
              law, or any regulations having the force of law, including any
              laws or regulations concerning the integrity of trading markets
              (e.g., manipulative tactics commonly known as spoofing and wash
              trading) or trading of securities or derivatives;
            </li>
            <li className="opacity-80">
              engage in any activity that seeks to defraud us or any other
              person or entity, including providing any false, inaccurate, or
              misleading information in order to unlawfully obtain the property
              of another;
            </li>
            <li className="opacity-80">
              transact with any Restricted Persons or any person or entity in a
              Restricted Territory;
            </li>
            <li className="opacity-80">
              impersonate any person or entity, or falsely state or otherwise
              misrepresent your affiliation with a person or entity;
            </li>
            <li className="opacity-80">
              further or promote any criminal activity or enterprise or provide
              instructional information about illegal activities; or
            </li>
            <li className="opacity-80">
              encourage or enable any other individual to do any of the
              foregoing.
            </li>
          </ol>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Intellectual Property Rights.</span>
          <ol className="mt-2 space-y-2 pl-8">
            <li className="opacity-80">
              <span className="font-semibold">Platform Content.</span> You
              acknowledge and agree that the Platform may contain content or
              features (<strong>&ldquo;Platform Content&rdquo;</strong>) that
              are protected by copyright, patent, trademark, trade secret, or
              other proprietary rights and laws. The Arbitrum Foundation retains
              all rights to Platform Content. Furthermore, except as expressly
              authorized by the Arbitrum Foundation (e.g., to the extent any of
              the Platform is made available under an open source license), you
              agree not to modify, copy, frame, scrape, rent, lease, loan, sell,
              distribute, or create derivative works based on the Platform or
              the Platform Content, in whole or in part. Any use of the Platform
              or the Platform Content other than as specifically authorized
              herein is strictly prohibited.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Trademarks.</span> The Arbitrum
              Foundation name and logos are trademarks and service marks of the
              Arbitrum Foundation (collectively the{" "}
              <strong>&ldquo;The Arbitrum Foundation Trademarks&rdquo;</strong>
              ). Other company, product, and service names and logos used and
              displayed via the Platform may be trademarks or service marks of
              their respective owners who may or may not endorse or be
              affiliated with or connected to the Arbitrum Foundation. Nothing
              in these Governance Platform Terms or the Platform should be
              construed as granting, by implication, estoppel, or otherwise, any
              license or right to use any of the Arbitrum Foundation Trademarks
              displayed on the Platform, without our prior written permission in
              each instance. All goodwill generated from the use of the Arbitrum
              Foundation Trademarks will inure to our exclusive benefit.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Third-Party Material.</span> Under
              no circumstances will the Arbitrum Foundation be liable in any way
              for any content or materials of any third parties, including for
              any errors or omissions in any content, or for any loss or damage
              of any kind incurred as a result of the use of any such content.
              You acknowledge that the Arbitrum Foundation does not pre-screen
              content, but that the Arbitrum Foundation and its designees will
              have the right (but not the obligation) in their sole discretion
              to refuse or remove any content that is available via the Site.
              Without limiting the foregoing, the Arbitrum Foundation and its
              designees will have the right to remove from the Site any content
              that violates these Governance Platform Terms or is deemed by the
              Arbitrum Foundation, in its sole discretion, to be otherwise
              objectionable. You agree that you must evaluate, and bear all
              risks associated with, the use of any content, including any
              reliance on the accuracy, completeness, or usefulness of such
              content.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">User Content.</span> The Platform
              may allow you to store or share content such as text (in posts or
              communications with others), files, documents, graphics, images,
              music, software, audio and video. Anything (other than
              Submissions) that you post or otherwise make available through the
              Platform is referred to as{" "}
              <strong>&ldquo;User Content&rdquo;</strong>. The Arbitrum
              Foundation does not claim any ownership rights in any User Content
              and nothing in these Governance Platform Terms will be deemed to
              restrict any rights that you may have to your User Content. By
              making any User Content available through the Platform you hereby
              grant to the Arbitrum Foundation a non-exclusive, transferable,
              worldwide, royalty-free license, with the right to sublicense, to
              use, copy, modify, create derivative works based upon, distribute,
              publicly display, and publicly perform your User Content in
              connection with operating and providing the Platform. You are
              solely responsible for all your User Content. You represent and
              warrant that you have (and will have) all rights that are
              necessary to grant us the license rights in your User Content
              under these Governance Platform Terms. You represent and warrant
              that neither your User Content, nor your use and provision of your
              User Content to be made available through the Platform, nor any
              use of your User Content by the Arbitrum Foundation on or through
              the Platform will infringe, misappropriate or violate a third
              party&rsquo;s intellectual property rights, or rights of publicity
              or privacy, or result in the violation of any applicable law or
              regulation. You can remove your User Content by specifically
              deleting it. In certain instances, some of your User Content (such
              as posts or comments you make) may not be completely removed and
              copies of your User Content may continue to exist on the Platform.
              To the maximum extent permitted by law, we are not responsible or
              liable for the removal or deletion of (or the failure to remove or
              delete) any of your User Content.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">User Feedback.</span> Any
              questions, comments, suggestions, ideas, feedback, reviews, or
              other information about the Platform (
              <strong>&ldquo;Submissions&rdquo;</strong>), provided by you to
              the Arbitrum Foundation are non-confidential and the Arbitrum
              Foundation will be entitled to the unrestricted use and
              dissemination of these Submissions for any purpose, commercial or
              otherwise, without acknowledgment, attribution, or compensation to
              you.
            </li>
          </ol>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Third-Party Services.</span> The
          Platform provides access to services, sites, technology, applications
          and resources that are provided or otherwise made available by third
          parties (the <strong>&ldquo;Third-Party Services&rdquo;</strong>).
          Your access and use of the Third-Party Services may also be subject to
          additional terms and conditions, privacy policies, or other agreements
          with such third party. The Arbitrum Foundation has no control over and
          is not responsible for such Third-Party Services, including for the
          accuracy, availability, reliability, or completeness of information
          shared by or available through Third-Party Services, or on the privacy
          practices of Third-Party Services. We encourage you to review the
          privacy policies of the third parties providing Third-Party Services
          prior to using such services. You, and not the Arbitrum Foundation,
          will be responsible for any and all costs and charges associated with
          your use of any Third-Party Services. The integration or inclusion of
          such Third-Party Services does not imply an endorsement or
          recommendation. Any dealings you have with third parties while using
          the Platform are between you and the third party. The Arbitrum
          Foundation will not be responsible or liable, directly or indirectly,
          for any damage or loss caused or alleged to be caused by or in
          connection with use of or reliance on any Third-Party Services.
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Termination.</span> We may suspend or
          terminate your access to and use of the Platform at our sole
          discretion, at any time and without notice to you. Upon any
          termination, discontinuation or cancellation of the Platform or your
          account, the following Sections will survive: 4, 5, 6, 7, 8, 9, 10, 11
          and 12.
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Indemnification and Release.</span>{" "}
          You will indemnify, defend (at our option), and hold the Arbitrum
          Foundation and its officers, directors, employees and agents, harmless
          from and against any claims, disputes, demands, liabilities, damages,
          losses, and costs and expenses, including, without limitation,
          reasonable legal and accounting fees arising out of or in any way
          connected with (a) your access to or use of the Platform; (b) your
          violation of these Governance Platform Terms; or (c) your infringement
          or misappropriation of the rights of any other person or entity. You
          will not settle or otherwise compromise any claim subject to this
          Section without the prior written consent of the Arbitrum Foundation.
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Warranty Disclaimers.</span>
          <p className="mt-2 opacity-80">
            YOUR USE OF THE PLATFORM IS AT YOUR SOLE RISK. THE PLATFORM IS
            PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
            BASIS. THE ARBITRUM FOUNDATION PARTIES EXPRESSLY DISCLAIM ALL
            WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED OR STATUTORY,
            INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
          </p>
          <p className="mt-2 opacity-80">
            THE ARBITRUM FOUNDATION PARTIES MAKE NO WARRANTY THAT (A) THE
            PLATFORM WILL MEET YOUR REQUIREMENTS; (B) THE PLATFORM WILL BE
            UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE; (C) THE RESULTS THAT
            MAY BE OBTAINED FROM THE USE OF THE PLATFORM WILL BE ACCURATE OR
            RELIABLE; OR (D) THE QUALITY OF ANY PRODUCTS, PLATFORM,
            APPLICATIONS, INFORMATION, OR OTHER MATERIAL PURCHASED OR OBTAINED
            BY YOU THROUGH THE PLATFORM WILL MEET YOUR EXPECTATIONS.
          </p>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Limitation of Liability.</span>
          <p className="mt-2 opacity-80">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER THE ARBITRUM
            FOUNDATION NOR ITS PLATFORM PROVIDERS INVOLVED IN CREATING,
            PRODUCING, OR DELIVERING THE PLATFORM WILL BE LIABLE FOR ANY
            INCIDENTAL, SPECIAL, EXEMPLARY OR CONSEQUENTIAL DAMAGES, OR DAMAGES
            FOR LOST PROFITS, LOST REVENUES, LOST SAVINGS, LOST BUSINESS
            OPPORTUNITY, LOSS OF DATA OR GOODWILL, PLATFORM INTERRUPTION,
            COMPUTER DAMAGE OR SYSTEM FAILURE OR THE COST OF SUBSTITUTE PLATFORM
            OF ANY KIND ARISING OUT OF OR IN CONNECTION WITH THESE GOVERNANCE
            PLATFORM TERMS OR FROM THE USE OF OR INABILITY TO USE THE PLATFORM,
            WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE),
            PRODUCT LIABILITY OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT THE
            ARBITRUM FOUNDATION OR ITS PLATFORM PROVIDERS HAVE BEEN INFORMED OF
            THE POSSIBILITY OF SUCH DAMAGE, EVEN IF A LIMITED REMEDY SET FORTH
            HEREIN IS FOUND TO HAVE FAILED OF ITS ESSENTIAL PURPOSE.
          </p>
          <p className="mt-2 opacity-80">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL THE
            ARBITRUM FOUNDATIONS&rsquo; TOTAL LIABILITY ARISING OUT OF OR IN
            CONNECTION WITH THESE GOVERNANCE PLATFORM TERMS OR FROM THE USE OF
            OR INABILITY TO USE THE PLATFORM EXCEED THE AMOUNTS YOU HAVE PAID OR
            ARE PAYABLE BY YOU TO THE ARBITRUM FOUNDATION FOR USE OF THE
            PLATFORM OR ONE HUNDRED DOLLARS ($100), IF YOU HAVE NOT HAD ANY
            PAYMENT OBLIGATIONS TO THE ARBITRUM FOUNDATION, AS APPLICABLE.
          </p>
          <p className="mt-2 opacity-80">
            THE EXCLUSIONS AND LIMITATIONS OF DAMAGES SET FORTH ABOVE ARE
            FUNDAMENTAL ELEMENTS OF THE BASIS OF THE BARGAIN BETWEEN THE
            ARBITRUM FOUNDATION AND YOU.
          </p>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">
            Dispute Resolution by Binding Arbitration.
          </span>
          <ol className="mt-2 space-y-2 pl-8">
            <li className="opacity-80">
              <span className="font-semibold">
                Mandatory Arbitration of Disputes.
              </span>{" "}
              We each agree that any dispute, claim or controversy arising out
              of or relating to these Governance Platform Terms or the breach,
              termination, enforcement, interpretation or validity thereof or
              the use of the Platform (collectively,{" "}
              <strong>&ldquo;Disputes&rdquo;</strong>) will be resolved solely
              by binding, individual arbitration and not in a class,
              representative or consolidated action or proceeding. You and the
              Arbitrum Foundation agree that Cayman Islands law governs the
              interpretation and enforcement of these Governance Platform Terms,
              and that you and the Arbitrum Foundation are each waiving the
              right to a trial by jury or to participate in a class action. This
              arbitration provision shall survive termination of these
              Governance Platform Terms.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Exceptions.</span> As limited
              exceptions to Section 11(a) above: (i) we both may seek to resolve
              a Dispute in Summary Court of the Cayman Islands if it qualifies;
              and (ii) we each retain the right to seek injunctive or other
              equitable relief from a court to prevent (or enjoin) the
              infringement or misappropriation of our intellectual property
              rights.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">
                Conducting Arbitration and Arbitration Rules.
              </span>{" "}
              Any Disputes arising out of or relating to these Governance
              Platform Terms, including the existence, validity, interpretation,
              performance, breach or termination thereof or any dispute
              regarding non-contractual obligations arising out of or relating
              to it shall be referred to and finally resolved by binding
              arbitration to be administered by the Cayman International
              Mediation and Arbitration Centre (CI-MAC) in accordance with the
              CI-MAC Arbitration Rules (the{" "}
              <strong>&ldquo;Arbitration Rules&rdquo;</strong>) in force as at
              the date of these Governance Platform Terms, which Arbitration
              Rules are deemed to be incorporated by reference to these
              Governance Platform Terms. The arbitration shall be conducted in
              the English language, and the place of arbitration shall be in
              George Town, Grand Cayman, Cayman Islands. The arbitration shall
              be determined by a sole arbitrator to be appointed in accordance
              with the Arbitration Rules. The decision of the sole arbitrator to
              any such dispute, controversy, difference or claim shall be in
              writing and shall be final and binding upon both parties without
              any right of appeal, and judgment upon any award thus obtained may
              be entered in or enforced by any court having jurisdiction
              thereof. No action at law or in equity based upon any claim
              arising out of or in relation to these Governance Platform Terms
              shall be instituted in any court of any jurisdiction. Each party
              waives any right it may have to assert the doctrine of forum non
              conveniens, to assert that it is not subject to the jurisdiction
              of such arbitration or courts or to object to venue to the extent
              any proceeding is brought in accordance herewith.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Arbitration Costs.</span> Payment
              of all filing, administration and arbitrator fees will be governed
              by the Arbitration Rules. If you prevail in arbitration you will
              be entitled to an award of attorneys&rsquo; fees and expenses to
              the extent provided under applicable law.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">
                Injunctive and Declaratory Relief.
              </span>{" "}
              Except as provided in Section 11(b) above, the arbitrator shall
              determine all issues of liability on the merits of any claim
              asserted by either party and may award declaratory or injunctive
              relief only in favor of the individual party seeking relief and
              only to the extent necessary to provide relief warranted by that
              party&rsquo;s individual claim. To the extent that you or we
              prevail on a claim and seek public injunctive relief (that is,
              injunctive relief that has the primary purpose and effect of
              prohibiting unlawful acts that threaten future injury to the
              public), the entitlement to and extent of such relief must be
              litigated in a civil court of competent jurisdiction and not in
              arbitration. The parties agree that litigation of any issues of
              public injunctive relief shall be stayed pending the outcome of
              the merits of any individual claims in arbitration.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Class Action Waiver.</span> YOU
              AND THE ARBITRUM FOUNDATION AGREE THAT EACH MAY BRING CLAIMS
              AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT
              AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR
              REPRESENTATIVE PROCEEDING. Further, if the parties&rsquo; Dispute
              is resolved through arbitration, the arbitrator may not
              consolidate another person&rsquo;s claims with your claims, and
              may not otherwise preside over any form of a representative or
              class proceeding. If this specific provision is found to be
              unenforceable, then the entirety of this Dispute Resolution
              section shall be null and void.
            </li>
            <li className="opacity-80">
              <span className="font-semibold">Severability.</span> With the
              exception of any of the provisions in Section 11(f) of these
              Governance Platform Terms (
              <strong>&ldquo;Class Action Waiver&rdquo;</strong>), if an
              arbitrator or court of competent jurisdiction decides that any
              part of these Governance Terms is invalid or unenforceable, the
              other parts of these Governance Platform Terms will still apply.
            </li>
          </ol>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">General.</span>
          <p className="mt-2 opacity-80">
            These Governance Platform Terms (together with the terms
            incorporated by reference herein) constitute the entire agreement
            between you and the Arbitrum Foundation governing your access and
            use of the Platform, and supersede any prior agreements between you
            and the Arbitrum Foundation with respect to the Platform. You also
            may be subject to additional terms and conditions that may apply
            when you use Third-Party Services, third-party content or
            third-party software. These Governance Platform Terms will be
            governed by the laws of the Cayman Islands without regard to its
            conflict of law provisions. With respect to any disputes or claims
            not subject to arbitration, as set forth above, you and the Arbitrum
            Foundation submit to the personal and exclusive jurisdiction of the
            state and federal courts located within the Cayman Islands. The
            failure of the Arbitrum Foundation to exercise or enforce any right
            or provision of these Governance Platform Terms will not constitute
            a waiver of such right or provision. The waiver of any such right or
            provision will be effective only if in writing and signed by a duly
            authorized representative of the Arbitrum Foundation. Except as
            expressly set forth in these Governance Platform Terms, the exercise
            by either party of any of its remedies under these Governance
            Platform Terms will be without prejudice to its other remedies under
            these Governance Platform Terms or otherwise. If any provision of
            these Governance Platform Terms is found by a court of competent
            jurisdiction to be invalid, the parties nevertheless agree that the
            court should endeavor to give effect to the parties&rsquo;
            intentions as reflected in the provision, and the other provisions
            of these Governance Platform Terms remain in full force and effect.
            You agree that regardless of any statute or law to the contrary, any
            claim or cause of action arising out of or related to use of the
            Platform or these Governance Platform Terms must be filed within one
            (1) year after such claim or cause of action arose or be forever
            barred. A printed version of these Governance Platform Terms and of
            any notice given in electronic form will be admissible in judicial
            or administrative proceedings based upon or relating to these
            Governance Platform Terms to the same extent and subject to the same
            conditions as other business documents and records originally
            generated and maintained in printed form. You may not assign these
            Governance Platform Terms without the prior written consent of the
            Arbitrum Foundation, but the Arbitrum Foundation may assign or
            transfer these Governance Platform Terms, in whole or in part,
            without restriction. Subject to the foregoing, these Governance
            Platform Terms will bind and inure to the benefit of the parties,
            their successors and permitted assigns. The section titles in these
            Governance Platform Terms are for convenience only and have no legal
            or contractual effect. As used in these Governance Platform Terms,
            the words &ldquo;include&rdquo; and &ldquo;including,&rdquo; and
            variations thereof, will not be deemed to be terms of limitation,
            but rather will be deemed to be followed by the words &ldquo;without
            limitation.&rdquo; Notices to you may be made via either email or
            regular mail. The Platform may also provide notices to you of
            changes to these Governance Platform Terms or other matters by
            displaying notices or links to notices generally on the Platform.
            For notices made by email, the date of receipt will be deemed the
            date on which such notice is transmitted. The Arbitrum Foundation
            will not be in default hereunder by reason of any failure or delay
            in the performance of its obligations where such failure or delay is
            due to civil disturbances, riot, epidemic, hostilities, war,
            terrorist attack, embargo, natural disaster, acts of God, flood,
            fire, sabotage, fluctuations or unavailability of electrical power,
            network access or equipment, or any other circumstances or causes
            beyond the Arbitrum Foundation&rsquo;s reasonable control.
          </p>
        </li>
        <li className="opacity-80">
          <span className="font-semibold">Questions?</span>
          <p className="mt-2 opacity-80">
            Please contact us at{" "}
            <a href="mailto:info@arbitrum.foundation">
              info@arbitrum.foundation
            </a>{" "}
            to report any violations of these Governance Platform Terms or to
            pose any questions regarding these Governance Platform Terms or the
            Platform.
          </p>
        </li>
      </ol>
    </div>
  );
}
